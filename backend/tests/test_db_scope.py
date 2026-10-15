from kb.db import DB


def test_one_session_per_request(app, client):
    """current_auth und die Route müssen dieselbe Session teilen."""
    seen = []

    @app.get("/api/v1/_probe")
    def probe(db: DB, db2: DB):
        seen.append((db, db2))
        return {}

    client.get("/api/v1/_probe")
    a, b = seen[0]
    assert a is b
