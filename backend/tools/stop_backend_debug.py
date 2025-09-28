#!/usr/bin/env python3
"""Stop the backend debug server launched by run_backend_debug.py."""
from __future__ import annotations

import os
import signal
import time
from pathlib import Path

PID_FILE = Path(__file__).resolve().parents[2] / ".vscode" / "backend-debug.pid"


def _read_pid() -> int | None:
    try:
        return int(PID_FILE.read_text(encoding="utf-8").strip())
    except FileNotFoundError:
        return None
    except ValueError:
        return None


def _remove_pid_file() -> None:
    try:
        PID_FILE.unlink()
    except FileNotFoundError:
        return


def _terminate(pid: int) -> None:
    sig = getattr(signal, "SIGTERM", signal.SIGINT)
    try:
        os.kill(pid, sig)
    except ProcessLookupError:
        return
    except PermissionError:
        return


def main() -> None:
    pid = _read_pid()
    if pid is None:
        print("No backend debug server is currently running.")
        return

    _terminate(pid)
    for _ in range(10):
        time.sleep(0.1)
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            _remove_pid_file()
            print("Backend debug server stopped.")
            return
    _remove_pid_file()
    print("Timed out waiting for backend debug server to stop. Process id:", pid)


if __name__ == "__main__":
    main()
