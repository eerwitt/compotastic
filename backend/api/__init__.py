"""API package exposing the FastAPI router and application factory."""

from .app import app, create_app
from .router import router

__all__ = ["app", "create_app", "router"]
