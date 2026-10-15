from kb.db import get_db


def test_healthz_answers_without_login(client):
    r = client.get("/api/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_healthz_does_not_touch_the_database(app, client):
    def broken():
        raise RuntimeError("Datenbank weg")
        yield  # pragma: no cover

    app.dependency_overrides[get_db] = broken
    assert client.get("/api/healthz").status_code == 200


def test_unknown_route_is_german_404(client):
    r = client.get("/api/v1/gibt-es-nicht")
    assert r.status_code == 404
    assert r.json() == {"detail": "Nicht gefunden."}
