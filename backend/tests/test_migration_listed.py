"""Migration 0004: bestehende Anhänge, die im Text vorkommen, verschwinden aus der Liste."""

import uuid

from sqlalchemy import text

from kb.migrate import downgrade, upgrade


def test_backfill_hides_attachments_used_in_text(migrated, committing_engine):
    downgrade(migrated, "0003")
    try:
        with committing_engine.begin() as c:
            uid, sid, pid = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
            used, loose = uuid.uuid4(), uuid.uuid4()
            c.execute(text("INSERT INTO users (id, email, name, role, active, must_change_password, avatar_color) "
                           "VALUES (:i, 'm@x.org', 'M', 'admin', true, false, 'teal')"), {"i": uid})
            c.execute(text("INSERT INTO spaces (id, slug, name, icon, color, description, default_access) "
                           "VALUES (:i, 'mig', 'Mig', 'x', 'teal', '', 'read')"), {"i": sid})
            c.execute(text("INSERT INTO pages (id, space_id, title, icon, content_md, position, version) "
                           "VALUES (:i, :s, 'P', '', :c, 0, 1)"),
                      {"i": pid, "s": sid, "c": f"![x](/api/v1/attachments/{used})"})
            for aid, name in ((used, "im-text.png"), (loose, "lose.pdf")):
                c.execute(text("INSERT INTO attachments (id, page_id, sha256, filename, mime_type, size) "
                               "VALUES (:i, :p, :h, :n, 'x', 1)"), {"i": aid, "p": pid, "h": "0" * 64, "n": name})
    finally:
        upgrade(migrated)
    with committing_engine.connect() as c:
        rows = dict(c.execute(text("SELECT filename, listed FROM attachments")).all())
        searchable = c.execute(text("SELECT attachments_text FROM pages")).scalar_one()
    assert rows == {"im-text.png": False, "lose.pdf": True}
    assert "lose" in searchable and "im-text" not in searchable
