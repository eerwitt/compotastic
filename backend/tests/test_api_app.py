"""Tests for the FastAPI application factory."""

from fastapi.testclient import TestClient

from api.app import create_app


def test_health_endpoint_available() -> None:
    """The health endpoint should respond with a 200 status and ok payload."""

    app = create_app()
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
