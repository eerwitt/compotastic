"""FastAPI router with websocket support for the Compotastic backend."""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from simulation.runtime import MeshSimulation

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Return a simple response to verify the service is reachable."""

    logger.debug("Health check requested")
    return {"status": "ok"}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Stream realtime simulation snapshots to connected websocket clients."""

    await websocket.accept()
    logger.info("Websocket connection accepted from %s", websocket.client)

    simulation = MeshSimulation(log_callback=logger.debug)
    update_interval = simulation.update_interval_seconds

    try:
        await websocket.send_text(simulation.snapshot().to_json())
        while True:
            await asyncio.sleep(update_interval)
            snapshot = simulation.step()
            await websocket.send_text(snapshot.to_json())
    except WebSocketDisconnect:
        logger.info("Websocket client disconnected: %s", websocket.client)
    except RuntimeError as exc:
        logger.info("Websocket closed while streaming: %s", exc)
    except Exception as exc:  # pragma: no cover - defensive logging for unexpected errors
        logger.exception("Unexpected websocket error: %s", exc)
        await websocket.close(code=1011)
        raise
