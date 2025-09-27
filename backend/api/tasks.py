"""In-memory background task management for the FastAPI backend."""

from __future__ import annotations

import asyncio
import io
import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol
from uuid import uuid4

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from openai import AsyncOpenAI


class TaskState(str, Enum):
    """Lifecycle states for a background task."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(slots=True)
class ImagePayload:
    """Immutable representation of an uploaded image payload."""

    data: bytes
    filename: str
    content_type: str | None = None

    def normalised_content_type(self) -> str:
        """Validate the payload data and return the JPEG content type."""

        return normalise_image_content_type(
            filename=self.filename,
            data=self.data,
            provided_type=self.content_type,
        )


@dataclass(slots=True)
class TaskInfo:
    """Metadata tracked for each background task."""

    metadata: dict[str, Any]
    status: TaskState = TaskState.PENDING
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    _completion_event: asyncio.Event = field(default_factory=asyncio.Event, repr=False)

    def snapshot(self) -> dict[str, Any]:
        """Return a serialisable snapshot of the task state."""

        payload: dict[str, Any] = {
            "status": self.status.value,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat() + "Z",
            "updated_at": self.updated_at.isoformat() + "Z",
        }
        if self.result is not None:
            payload["result"] = self.result
        if self.error is not None:
            payload["error"] = self.error
        return payload

    def mark_processing(self) -> None:
        self.status = TaskState.PROCESSING
        self.updated_at = datetime.now(UTC)

    def mark_completed(self, result: dict[str, Any]) -> None:
        self.status = TaskState.COMPLETED
        self.result = result
        self.updated_at = datetime.now(UTC)
        self._completion_event.set()

    def mark_failed(self, message: str) -> None:
        self.status = TaskState.FAILED
        self.error = message
        self.updated_at = datetime.now(UTC)
        self._completion_event.set()


class ImageProcessingService(Protocol):
    """Protocol describing an async processor for image tasks."""

    async def generate(self, metadata: dict[str, Any], payload: ImagePayload) -> dict[str, Any]:
        """Process an image with the provided metadata and return a result."""


JPEG_CONTENT_TYPE = "image/jpeg"
JPEG_CONTENT_TYPE_ALIASES = {"image/jpeg", "image/jpg"}
JPEG_EXTENSIONS = {".jpg", ".jpeg"}


def _looks_like_jpeg(data: bytes) -> bool:
    """Return ``True`` when ``data`` appears to be a JPEG image."""

    if len(data) < 4:
        return False

    starts_with_header = data[:2] == b"\xff\xd8"
    ends_with_footer = data[-2:] == b"\xff\xd9"
    return starts_with_header and ends_with_footer


def normalise_image_content_type(
    *, filename: str, data: bytes, provided_type: str | None
) -> str:
    """Validate the payload and return the JPEG content type."""

    if provided_type:
        lowered_type = provided_type.lower()
        if lowered_type not in JPEG_CONTENT_TYPE_ALIASES:
            raise ValueError("Only JPEG images are supported")

    suffix = Path(filename or "").suffix.lower()
    if suffix and suffix not in JPEG_EXTENSIONS:
        raise ValueError("Only .jpg images are supported")

    if not _looks_like_jpeg(data):
        raise ValueError("Uploaded data is not a valid JPEG image")

    return JPEG_CONTENT_TYPE


class ChunkedBytesIO(io.BytesIO):
    """A ``BytesIO`` wrapper that enforces chunked reads."""

    def __init__(self, data: bytes, chunk_size: int) -> None:
        super().__init__(data)
        self._chunk_size = max(1, chunk_size)

    def read(self, size: int = -1) -> bytes:  # noqa: D401 - inherit docstring
        if size == -1 or size > self._chunk_size:
            size = self._chunk_size
        return super().read(size)


class OpenAIImageProcessingService:
    """Adapter that streams uploaded images to the OpenAI Files API."""

    def __init__(
        self,
        *,
        client: "AsyncOpenAI" | None = None,
        default_model: str = "gpt-4.1-mini",
        chunk_size: int = 1024 * 1024,
        log_callback: logging.Logger | None = None,
    ) -> None:
        self._client = client
        self._default_model = default_model
        self._chunk_size = max(1, chunk_size)
        self._log = log_callback or logger

    async def generate(self, metadata: dict[str, Any], payload: ImagePayload) -> dict[str, Any]:
        """Upload an image in chunks and submit it to the OpenAI Responses API."""

        prompt = metadata.get("prompt", "Process image")
        model = metadata.get("model", self._default_model)
        chunk_size = int(metadata.get("chunk_size", self._chunk_size))

        self._log.debug("Uploading image '%s' in %d byte chunks", payload.filename, chunk_size)

        client = self._client
        if client is None:
            from openai import AsyncOpenAI

            client = AsyncOpenAI()
            self._client = client

        resolved_content_type = payload.normalised_content_type()
        if payload.content_type and payload.content_type.lower() != resolved_content_type:
            self._log.debug(
                "Normalised image content type for %s from %s to %s",
                payload.filename,
                payload.content_type,
                resolved_content_type,
            )

        stream = ChunkedBytesIO(payload.data, chunk_size)
        try:
            upload = await client.files.create(
                file=(
                    payload.filename,
                    stream,
                    resolved_content_type,
                ),
                purpose="vision",
            )
        finally:
            stream.close()

        self._log.debug("Image upload complete for file %s (id=%s)", payload.filename, upload.id)

        self._log.debug("Submitting response request to model '%s'", model)
        response = await client.responses.create(
            model=model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_id": upload.id},
                    ],
                }
            ],
            metadata=metadata,
        )

        result_payload: dict[str, Any]
        if hasattr(response, "model_dump"):
            result_payload = response.model_dump()
        elif hasattr(response, "dict"):
            result_payload = response.dict()
        else:
            result_payload = json.loads(str(response)) if isinstance(response, str) else {"response": str(response)}

        return {
            "file_id": getattr(upload, "id", None),
            "response": result_payload,
        }


class BackgroundTaskManager:
    """Coordinate execution of in-memory background tasks."""

    def __init__(self, *, image_service: ImageProcessingService, log_callback: logging.Logger | None = None) -> None:
        self._image_service = image_service
        self._log = log_callback or logger
        self._tasks: dict[str, TaskInfo] = {}
        self._lock = asyncio.Lock()

    async def create_task(
        self,
        metadata: dict[str, Any],
        payload: ImagePayload,
    ) -> str:
        """Create a new background task and return its identifier."""

        task_id = uuid4().hex
        task_info = TaskInfo(metadata=json.loads(json.dumps(metadata)))

        async with self._lock:
            self._tasks[task_id] = task_info

        self._log.info("Created background task %s", task_id)

        asyncio.create_task(self._run_task(task_id, task_info, payload))
        return task_id

    async def _run_task(self, task_id: str, task_info: TaskInfo, payload: ImagePayload) -> None:
        task_info.mark_processing()
        self._log.debug("Task %s marked as processing", task_id)

        try:
            result = await self._image_service.generate(task_info.metadata, payload)
        except Exception as exc:  # pragma: no cover - defensive logging
            message = str(exc)
            self._log.exception("Task %s failed: %s", task_id, message)
            task_info.mark_failed(message)
        else:
            self._log.info("Task %s completed", task_id)
            task_info.mark_completed(result)

    async def get_status(self, task_id: str) -> dict[str, Any]:
        """Return the latest status for ``task_id``."""

        task = await self._get_task(task_id)
        return task.snapshot()

    async def wait_for_completion(self, task_id: str, timeout: float | None = None) -> dict[str, Any]:
        """Block until the specified task completes and return its snapshot."""

        task = await self._get_task(task_id)
        await asyncio.wait_for(task._completion_event.wait(), timeout=timeout)
        return task.snapshot()

    async def _get_task(self, task_id: str) -> TaskInfo:
        async with self._lock:
            task = self._tasks.get(task_id)
        if task is None:
            self._log.debug("Task lookup failed for id %s", task_id)
            raise KeyError(task_id)
        return task

