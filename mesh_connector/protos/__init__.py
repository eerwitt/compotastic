"""Protocol buffer definitions for the mesh connector payloads."""

from __future__ import annotations

from pathlib import Path

# Provide runtime access to the raw .proto file so tooling can locate and compile
# it without needing hard coded paths within the repository tree.
PROTO_ROOT = Path(__file__).resolve().parent
MESH_CONNECTOR_PROTO = PROTO_ROOT / "mesh_connector.proto"

__all__ = ["PROTO_ROOT", "MESH_CONNECTOR_PROTO"]
