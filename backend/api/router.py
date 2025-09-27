"""FastAPI router with websocket and background task endpoints for Compotastic."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi import WebSocket, WebSocketDisconnect

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from simulation.runtime import MeshSimulation

from .tasks import BackgroundTaskManager, ImagePayload, OpenAIImageProcessingService

logger = logging.getLogger(__name__)

router = APIRouter()

task_manager = BackgroundTaskManager(
    image_service=OpenAIImageProcessingService(log_callback=logger),
    log_callback=logger,
)


def get_task_manager() -> BackgroundTaskManager:
    """Return the configured background task manager."""

    return task_manager


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


@router.post("/tasks", status_code=status.HTTP_202_ACCEPTED)
async def create_background_task(
    metadata: str = Form(..., description="JSON metadata for the OpenAI request"),
    file: UploadFile = File(..., description="Image file to upload"),
    manager: BackgroundTaskManager = Depends(get_task_manager),
) -> dict[str, str]:
    """Create a background task that uploads an image to OpenAI."""

    try:
        metadata_payload = json.loads(metadata)
    except json.JSONDecodeError as exc:
        logger.debug("Invalid metadata JSON supplied: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid metadata JSON") from exc

    image_bytes = await file.read()
    if not image_bytes:
        logger.debug("Empty image upload received for background task")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded image is empty")

    payload = ImagePayload(data=image_bytes, filename=file.filename or "upload.bin", content_type=file.content_type)

    try:
        payload.normalised_content_type()
    except ValueError as exc:
        logger.debug("Rejected non-JPEG upload %s: %s", file.filename, exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    task_id = await manager.create_task(metadata_payload, payload)
    return {"task_id": task_id}


@router.get("/tasks/{task_id}")
async def get_background_task(
    task_id: str,
    manager: BackgroundTaskManager = Depends(get_task_manager),
) -> dict[str, object]:
    """Retrieve status for a previously created background task."""

    try:
        status_payload = await manager.get_status(task_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found") from exc
    return status_payload
