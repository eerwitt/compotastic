"""Tests for the background task manager and API endpoints."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import unittest
from types import SimpleNamespace
from typing import Any
from fastapi.testclient import TestClient

from api.app import create_app
from api.router import get_task_manager
from api.tasks import (
    CLASSIFICATION_ATTRIBUTE_SOURCE,
    CLASSIFICATION_REWARD_VALUES,
    BackgroundTaskManager,
    ImagePayload,
    OpenAIImageProcessingService,
)

JPEG_BYTES = b"\xff\xd8test-jpeg-data\xff\xd9"


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


class _StubOpenAIClient:
    def __init__(self, response_payload: Any | None = None) -> None:
        self.upload_requests: list[tuple[str, bytes, str]] = []
        self.files = self._Files(self.upload_requests)
        self.responses = self._Responses(response_payload)

    class _Files:
        def __init__(self, upload_requests: list[tuple[str, bytes, str]]) -> None:
            self._upload_requests = upload_requests

        async def create(self, *, file: tuple[str, Any, str], purpose: str) -> SimpleNamespace:  # noqa: ANN401
            filename, stream, content_type = file
            self._upload_requests.append((filename, stream.getvalue(), content_type))
            return SimpleNamespace(id="file_123", purpose=purpose)

    class _Responses:
        def __init__(self, response_payload: Any | None) -> None:
            self._response_payload = response_payload

        async def create(self, **kwargs: Any) -> SimpleNamespace:  # noqa: ANN401
            if callable(self._response_payload):
                payload = self._response_payload(kwargs)
            elif self._response_payload is not None:
                payload = self._response_payload
            else:
                payload = {"kwargs": kwargs}
            return SimpleNamespace(model_dump=lambda: payload)


class ImagePayloadTests(unittest.TestCase):
    def test_accepts_valid_jpeg_payload(self) -> None:
        payload = ImagePayload(
            data=JPEG_BYTES,
            filename="photo.jpg",
            content_type="image/jpeg",
        )

        self.assertEqual(payload.normalised_content_type(), "image/jpeg")

    def test_allows_jpg_alias(self) -> None:
        payload = ImagePayload(
            data=JPEG_BYTES,
            filename="photo.jpg",
            content_type="image/jpg",
        )

        self.assertEqual(payload.normalised_content_type(), "image/jpeg")

    def test_rejects_non_jpeg_extension(self) -> None:
        payload = ImagePayload(
            data=JPEG_BYTES,
            filename="photo.png",
            content_type="image/jpeg",
        )

        with self.assertRaises(ValueError):
            payload.normalised_content_type()

    def test_rejects_non_jpeg_content_type(self) -> None:
        payload = ImagePayload(
            data=JPEG_BYTES,
            filename="photo.jpg",
            content_type="image/png",
        )

        with self.assertRaises(ValueError):
            payload.normalised_content_type()

    def test_rejects_non_jpeg_data(self) -> None:
        payload = ImagePayload(
            data=b"not-jpeg",
            filename="photo.jpg",
            content_type="image/jpeg",
        )

        with self.assertRaises(ValueError):
            payload.normalised_content_type()


class BackgroundTaskManagerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.logger = logging.getLogger("test.background")

    async def test_create_and_complete_task(self) -> None:
        service = _StubImageService()
        manager = BackgroundTaskManager(image_service=service, log_callback=self.logger)
        payload = ImagePayload(data=JPEG_BYTES, filename="test.jpg", content_type="image/jpeg")
        task_id = await manager.create_task({"prompt": "hello"}, payload)

        status = await manager.wait_for_completion(task_id, timeout=1)

        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["result"]["size"], len(JPEG_BYTES))
        self.assertEqual(len(service.calls), 1)

    async def test_task_failure_is_reported(self) -> None:
        manager = BackgroundTaskManager(image_service=_FailingImageService(), log_callback=self.logger)
        payload = ImagePayload(data=JPEG_BYTES, filename="broken.jpg", content_type="image/jpeg")
        task_id = await manager.create_task({}, payload)

        status = await manager.wait_for_completion(task_id, timeout=1)
        self.assertEqual(status["status"], "failed")
        self.assertIn("boom", status["error"])


class OpenAIImageProcessingServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_normalised_content_type_used_for_upload(self) -> None:
        payload = ImagePayload(
            data=JPEG_BYTES,
            filename="photo.jpg",
            content_type="image/jpg",
        )
        client = _StubOpenAIClient()
        service = OpenAIImageProcessingService(client=client, log_callback=logging.getLogger("test.service"))

        result = await service.generate({"prompt": "hi"}, payload)

        self.assertEqual(result["file_id"], "file_123")
        self.assertEqual(len(client.upload_requests), 1)
        _, _, content_type = client.upload_requests[0]
        self.assertEqual(content_type, "image/jpeg")

    async def test_generate_adds_reward_from_classification(self) -> None:
        payload = ImagePayload(
            data=JPEG_BYTES,
            filename="scene.jpg",
            content_type="image/jpeg",
        )
        response_payload = {
            "output": [
                {
                    "content": [
                        {"type": "output_text", "text": "MOVABLE crate"},
                    ],
                }
            ]
        }
        client = _StubOpenAIClient(response_payload=response_payload)
        metadata = {
            "prompt": "classify",
            "tileX": 6,
            "tileY": 2,
            "imageLabel": "crate",
            "filename": "scene.jpg",
        }
        service = OpenAIImageProcessingService(client=client, log_callback=logging.getLogger("test.service"))

        result = await service.generate(metadata, payload)

        self.assertEqual(result["classification"], "MOVABLE")
        reward = result.get("reward")
        assert reward is not None
        self.assertEqual(reward["tileX"], 6)
        self.assertEqual(reward["tileY"], 2)
        self.assertEqual(reward["value"], CLASSIFICATION_REWARD_VALUES["MOVABLE"])
        attributes = reward.get("attributes", {})
        self.assertEqual(attributes.get("classification"), "MOVABLE")
        self.assertEqual(attributes.get("source"), CLASSIFICATION_ATTRIBUTE_SOURCE)
        self.assertEqual(attributes.get("label"), "crate")

    def test_extract_classification_handles_nested_payloads(self) -> None:
        payload = {
            "choices": [
                {
                    "message": {
                        "content": [
                            {
                                "type": "output_text",
                                "text": "This obstacle is dangerous for robots.",
                            }
                        ]
                    }
                }
            ]
        }

        classification = OpenAIImageProcessingService._extract_classification(payload)

        self.assertEqual(classification, "DANGEROUS")


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
            files={"file": ("image.jpg", JPEG_BYTES, "image/jpeg")},
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
        self.assertEqual(final_status["result"]["filename"], "image.jpg")

    def test_invalid_metadata_returns_400(self) -> None:
        response = self.client.post(
            "/tasks",
            data={"metadata": "not-json"},
            files={"file": ("image.jpg", JPEG_BYTES, "image/jpeg")},
        )

        self.assertEqual(response.status_code, 400)

    def test_missing_file_returns_400(self) -> None:
        response = self.client.post(
            "/tasks",
            data={"metadata": json.dumps({})},
            files={"file": ("image.jpg", b"", "image/jpeg")},
        )

        self.assertEqual(response.status_code, 400)

    def test_non_jpeg_upload_returns_400(self) -> None:
        response = self.client.post(
            "/tasks",
            data={"metadata": json.dumps({})},
            files={"file": ("image.png", b"not-jpeg", "image/png")},
        )

        self.assertEqual(response.status_code, 400)

    def test_unknown_task_returns_404(self) -> None:
        response = self.client.get("/tasks/unknown")
        self.assertEqual(response.status_code, 404)
