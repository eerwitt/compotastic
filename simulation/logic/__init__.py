"""Core logic utilities for the Compotastic simulation."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LogicProbe:
    """Lightweight object used to verify simulation logic imports."""

    name: str = "simulation.logic"

    def is_available(self) -> bool:
        """Return True to indicate the logic module is importable."""

        return True


__all__ = ["LogicProbe"]
