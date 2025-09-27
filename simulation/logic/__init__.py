"""Core logic utilities for the Compotastic simulation."""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import replace
from typing import Iterable


@dataclass(frozen=True)
class LogicProbe:
    """Lightweight object used to verify simulation logic imports."""

    name: str = "simulation.logic"

    def is_available(self) -> bool:
        """Return True to indicate the logic module is importable."""

        return True


@dataclass(frozen=True)
class GridLocation:
    """Simple integer based coordinate used to place nodes on a 2D grid."""

    x: int
    y: int

    def __post_init__(self) -> None:
        if not isinstance(self.x, int) or not isinstance(self.y, int):
            raise TypeError("GridLocation coordinates must be integers")

    def translated(self, dx: int, dy: int) -> "GridLocation":
        """Return a new location offset by the provided deltas."""

        if not isinstance(dx, int) or not isinstance(dy, int):
            raise TypeError("GridLocation translation requires integer deltas")
        return GridLocation(self.x + dx, self.y + dy)


@dataclass(frozen=True)
class MeshtasticNode:
    """Representation of a Meshtastic node used in the simulation grid."""

    identifier: str
    battery_level: float
    compute_efficiency_flops_per_milliamp: float
    location: GridLocation

    def __post_init__(self) -> None:
        if not self.identifier:
            raise ValueError("MeshtasticNode requires a non-empty identifier")
        self._validate_battery_level(self.battery_level)
        self._validate_compute_efficiency(self.compute_efficiency_flops_per_milliamp)

    @staticmethod
    def _validate_battery_level(level: float) -> None:
        if not isinstance(level, (int, float)):
            raise TypeError("Battery level must be numeric")
        if level < 0 or level > 100:
            raise ValueError("Battery level must be within the range [0, 100]")

    @staticmethod
    def _validate_compute_efficiency(efficiency: float) -> None:
        if not isinstance(efficiency, (int, float)):
            raise TypeError("Compute efficiency must be numeric")
        if efficiency <= 0:
            raise ValueError("Compute efficiency must be a positive value")

    def with_battery_level(self, level: float) -> "MeshtasticNode":
        """Return a copy of the node with an updated battery level."""

        self._validate_battery_level(level)
        return replace(self, battery_level=float(level))

    def with_location(self, location: GridLocation) -> "MeshtasticNode":
        """Return a copy of the node at the supplied location."""

        if not isinstance(location, GridLocation):
            raise TypeError("location must be a GridLocation instance")
        return replace(self, location=location)

    def translated(self, dx: int, dy: int) -> "MeshtasticNode":
        """Return a copy of the node moved by the given grid offsets."""

        return self.with_location(self.location.translated(dx, dy))

    def estimate_milliamp_draw(self, flop_requirement: float) -> float:
        """Estimate milliamp usage to satisfy the provided FLOP requirement."""

        if not isinstance(flop_requirement, (int, float)):
            raise TypeError("FLOP requirement must be numeric")
        if flop_requirement < 0:
            raise ValueError("FLOP requirement cannot be negative")
        if flop_requirement == 0:
            return 0.0
        return float(flop_requirement) / self.compute_efficiency_flops_per_milliamp


def validate_unique_identifiers(nodes: Iterable[MeshtasticNode]) -> None:
    """Ensure each node in the provided iterable has a unique identifier."""

    seen = set()
    for node in nodes:
        if node.identifier in seen:
            raise ValueError(f"Duplicate Meshtastic node identifier: {node.identifier}")
        seen.add(node.identifier)


__all__ = [
    "LogicProbe",
    "GridLocation",
    "MeshtasticNode",
    "validate_unique_identifiers",
]
