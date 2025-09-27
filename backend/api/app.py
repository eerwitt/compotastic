"""FastAPI application factory for the Compotastic backend."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from .router import router

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""

    logger.debug("Creating FastAPI application")
    app = FastAPI(title="Compotastic Backend API")
    app.include_router(router)
    logger.debug("FastAPI application configured with router")
    return app


# Expose a module-level application for ASGI servers like ``uvicorn``.
app = create_app()
