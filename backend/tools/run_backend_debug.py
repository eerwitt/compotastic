#!/usr/bin/env python3
"""Run the FastAPI backend under debugpy waiting for VS Code to attach."""
from __future__ import annotations

import atexit
import logging
import os
import signal
import sys
from pathlib import Path

try:
    import debugpy
except ImportError as exc:  # pragma: no cover - debug tooling dependency
    raise SystemExit("debugpy must be installed to run the backend debug server.") from exc

try:
    import uvicorn
except ImportError as exc:  # pragma: no cover - runtime dependency
    raise SystemExit("uvicorn must be installed to run the backend debug server.") from exc

_LOGGER = logging.getLogger("backend.debug")

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 5678
UVICORN_APP = "backend.api.app:app"
UVICORN_HOST = "127.0.0.1"
UVICORN_PORT = 8001
PID_FILE = Path(__file__).resolve().parents[2] / ".vscode" / "backend-debug.pid"


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s - %(message)s",
        stream=sys.stdout,
    )


def _write_pid_file() -> None:
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")


def _remove_pid_file() -> None:
    try:
        PID_FILE.unlink()
    except FileNotFoundError:
        return


def _handle_signal(signum: int, frame) -> None:  # type: ignore[override]
    _LOGGER.info("Received signal %s, shutting down debug server.", signum)
    _remove_pid_file()
    sys.exit(0)


def main() -> None:
    _configure_logging()
    print("Starting backend debug server", flush=True)
    _write_pid_file()
    atexit.register(_remove_pid_file)

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, _handle_signal)

    debugpy.listen((LISTEN_HOST, LISTEN_PORT))
    message = f"Waiting for debugger to attach on {LISTEN_HOST}:{LISTEN_PORT}"
    print(message, flush=True)
    _LOGGER.info("Debugpy listening on %s:%s", LISTEN_HOST, LISTEN_PORT)
    debugpy.wait_for_client()
    _LOGGER.info("Debugger attached; starting Uvicorn on %s:%s", UVICORN_HOST, UVICORN_PORT)

    try:
        uvicorn.run(UVICORN_APP, host=UVICORN_HOST, port=UVICORN_PORT, log_level="info")
    except KeyboardInterrupt:
        _LOGGER.info("Keyboard interrupt received, shutting down backend debug server.")
    finally:
        _remove_pid_file()


if __name__ == "__main__":
    main()
