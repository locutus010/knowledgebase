"""Kommandozeile: python -m kb serve | migrate | create-admin | gc-uploads"""

import argparse
import getpass
import logging
import sys

from sqlalchemy.exc import IntegrityError

from kb.config import ConfigError, get_settings
from kb.db import make_engine, make_sessionmaker
from kb.models import User
from kb.repo.users import normalize_email
from kb.security import MIN_PASSWORD_LEN, hash_password


def _err(msg: str) -> int:
    print(msg, file=sys.stderr)
    return 1


def _sessionmaker(settings):
    return make_sessionmaker(make_engine(settings.database_url))


def cmd_migrate(settings, _args) -> int:
    from kb.migrate import upgrade

    upgrade(settings.database_url)
    print("Datenbank ist auf dem neuesten Stand.")
    return 0


def cmd_create_admin(settings, args) -> int:
    if args.password_stdin:
        password = sys.stdin.readline().rstrip("\n")
    else:
        password = getpass.getpass("Passwort: ")
        if getpass.getpass("Wiederholen: ") != password:
            return _err("Die Passwörter stimmen nicht überein.")
    if len(password) < MIN_PASSWORD_LEN:
        return _err(f"Das Passwort muss mindestens {MIN_PASSWORD_LEN} Zeichen haben.")
    email = normalize_email(args.email)
    with _sessionmaker(settings)() as db:
        db.add(User(email=email, name=args.name.strip(), role="admin",
                    password_hash=hash_password(password)))
        try:
            db.commit()
        except IntegrityError:
            return _err(f"Ein Konto mit der E-Mail {email} existiert bereits.")
    print(f"Administrator {email} angelegt.")
    return 0


def cmd_gc_uploads(settings, _args) -> int:
    from kb import storage

    with _sessionmaker(settings)() as db:
        removed = storage.gc(db, settings.upload_dir)
    print(f"{removed} verwaiste Datei(en) entfernt.")
    return 0


def cmd_serve(settings, _args) -> int:
    import uvicorn

    from kb import seed
    from kb.main import create_app
    from kb.migrate import upgrade

    upgrade(settings.database_url)
    with _sessionmaker(settings)() as db:
        seed.ensure_bootstrap(db, settings)
        seed.ensure_templates(db)
        db.commit()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    # proxy_headers + forwarded_allow_ips: die Client-IP für die Login-Drosselung kommt von
    # Caddy. Die App ist nur im Compose-Netz erreichbar, dort steht ausschließlich Caddy davor.
    uvicorn.run(create_app(settings), host="0.0.0.0", port=8000, proxy_headers=True,
                forwarded_allow_ips="*", access_log=False)
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="kb", description="Wissensdatenbank")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("serve", help="Migrieren und Server starten")
    sub.add_parser("migrate", help="Datenbank migrieren")
    p = sub.add_parser("create-admin", help="Administrator anlegen")
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--password-stdin", action="store_true", help="Passwort aus stdin lesen")
    sub.add_parser("gc-uploads", help="Verwaiste Anhang-Dateien löschen")
    args = parser.parse_args(argv)
    try:
        settings = get_settings()
    except ConfigError as e:
        return _err(str(e))
    handler = {"serve": cmd_serve, "migrate": cmd_migrate, "create-admin": cmd_create_admin,
               "gc-uploads": cmd_gc_uploads}[args.cmd]
    return handler(settings, args)


if __name__ == "__main__":
    sys.exit(main())
