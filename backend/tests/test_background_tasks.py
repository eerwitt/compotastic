"""Tests for the background task manager and API endpoints."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import unittest
from typing import Any

from fastapi.testclient import TestClient

from api.app import create_app
from api.router import get_task_manager
from api.tasks import BackgroundTaskManager, ImagePayload


class _StubImageService:
    def __init__(self, *, delay: float = 0.0) -> None:
        self.calls: list[tuple[dict[str, Any], ImagePayload]] = []
        self.delay = delay

    async def generate(self, metadata: dict[str, Any], payload: ImagePayload) -> dict[str, Any]:
        self.calls.append((metadata, payload))
        if self.delay:
            await asyncio.sleep(self.delay)
        return {
            "prompt": metadata.get("prompt"),
            "size": len(payload.data),
            "filename": payload.filename,
        }


class _FailingImageService:
    async def generate(self, metadata: dict[str, Any], payload: ImagePayload) -> dict[str, Any]:  # noqa: ARG002
        raise RuntimeError("boom")


class BackgroundTaskManagerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.logger = logging.getLogger("test.background")

    async def test_create_and_complete_task(self) -> None:
        service = _StubImageService()
        manager = BackgroundTaskManager(image_service=service, log_callback=self.logger)
        payload = ImagePayload(data=b"abc", filename="test.png", content_type="image/png")
        task_id = await manager.create_task({"prompt": "hello"}, payload)

        status = await manager.wait_for_completion(task_id, timeout=1)

        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["result"]["size"], 3)
        self.assertEqual(len(service.calls), 1)

    async def test_task_failure_is_reported(self) -> None:
        manager = BackgroundTaskManager(image_service=_FailingImageService(), log_callback=self.logger)
        payload = ImagePayload(data=b"abc", filename="broken.png")
        task_id = await manager.create_task({}, payload)

        status = await manager.wait_for_completion(task_id, timeout=1)
        self.assertEqual(status["status"], "failed")
        self.assertIn("boom", status["error"])


class BackgroundTaskApiTests(unittest.TestCase):
    def setUp(self) -> None:  # noqa: D401
        service = _StubImageService()
        self.manager = BackgroundTaskManager(image_service=service, log_callback=logging.getLogger("test.api"))
        self.app = create_app()
        self.app.dependency_overrides[get_task_manager] = lambda: self.manager
        self.client = TestClient(self.app)

    def tearDown(self) -> None:  # noqa: D401
        self.client.close()
        self.app.dependency_overrides.pop(get_task_manager, None)

    def test_create_task_endpoint(self) -> None:
        metadata = {"prompt": "describe"}
        response = self.client.post(
            "/tasks",
            data={"metadata": json.dumps(metadata)},
            files={"file": ("image.png", b"binary", "image/png")},
        )

        self.assertEqual(response.status_code, 202)
        task_id = response.json()["task_id"]

        final_status: dict[str, Any] | None = None
        for _ in range(50):
            status_response = self.client.get(f"/tasks/{task_id}")
            self.assertEqual(status_response.status_code, 200)
            payload = status_response.json()
            if payload["status"] in {"completed", "failed"}:
                final_status = payload
                break
            time.sleep(0.01)

        self.assertIsNotNone(final_status)
        assert final_status is not None
        self.assertEqual(final_status["status"], "completed")
        self.assertEqual(final_status["result"]["filename"], "image.png")

    def test_invalid_metadata_returns_400(self) -> None:
        response = self.client.post(
            "/tasks",
            data={"metadata": "not-json"},
            files={"file": ("image.png", b"data", "image/png")},
        )

        self.assertEqual(response.status_code, 400)

    def test_missing_file_returns_400(self) -> None:
        response = self.client.post(
            "/tasks",
            data={"metadata": json.dumps({})},
            files={"file": ("image.png", b"", "image/png")},
        )

        self.assertEqual(response.status_code, 400)

    def test_unknown_task_returns_404(self) -> None:
        response = self.client.get("/tasks/unknown")
        self.assertEqual(response.status_code, 404)
