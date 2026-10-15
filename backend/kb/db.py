"""Engine und Session pro Anfrage."""

from collections.abc import Iterator

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def make_engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=10)


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_db(request: Request) -> Iterator[Session]:
    session = request.app.state.sessionmaker()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# scope="function": Commit und Rollback laufen, *bevor* die Antwort rausgeht. Mit dem
# Vorgabe-Scope "request" ginge die 200 schon raus, während der Commit noch aussteht — ein
# scheiternder Commit bliebe unbemerkt, und ein schneller Folgeabruf sähe den alten Stand.
# Alle Stellen müssen dieses Alias nutzen: FastAPI cached Abhängigkeiten je Scope, ein
# nacktes Depends(get_db) daneben öffnete eine zweite Session in derselben Anfrage.
DB = Annotated[Session, Depends(get_db, scope="function")]
