"""FastAPI application factory for the Compotastic backend."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .router import router

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""

    logger.debug("Creating FastAPI application")
    app = FastAPI(title="Compotastic Backend API")
    app.include_router(router)

    origins = [
        "http://localhost.tiangolo.com",
        "https://localhost.tiangolo.com",
        "http://localhost",
        "http://localhost:8080",
        "http://localhost:5173",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    logger.debug("FastAPI application configured with router")
    return app


# Expose a module-level application for ASGI servers like ``uvicorn``.
app = create_app()
