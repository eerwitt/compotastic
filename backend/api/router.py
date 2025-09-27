"""FastAPI router with websocket support for the Compotastic backend."""

from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Return a simple response to verify the service is reachable."""

    logger.debug("Health check requested")
    return {"status": "ok"}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Accept websocket connections and echo received messages."""

    await websocket.accept()
    logger.info("Websocket connection accepted from %s", websocket.client)
    try:
        while True:
            message = await websocket.receive_text()
            logger.debug("Websocket message received: %s", message)
            await websocket.send_text(message)
    except WebSocketDisconnect:
        logger.info("Websocket client disconnected: %s", websocket.client)
    except Exception as exc:  # pragma: no cover - defensive logging for unexpected errors
        logger.exception("Unexpected websocket error: %s", exc)
        await websocket.close(code=1011)
        raise
