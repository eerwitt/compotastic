"""Runtime helpers for driving the realtime mesh simulation."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Set, Tuple

from dataclasses_json import dataclass_json

from .logic import GridLocation
from .logic import GridWorldEnvironment
from .logic import MeshtasticNode
from .logic import _default_logger


CoordinateSet = Set[Tuple[int, int]]


@dataclass_json
@dataclass(frozen=True)
class SimulationGrid:
    """Dataclass describing the grid used for rendering the map."""

    width: int
    height: int


@dataclass_json
@dataclass(frozen=True)
class SimulationSnapshot:
    """Serializable view of the current simulation state."""

    grid: SimulationGrid
    cats: List[MeshtasticNode]
    dogs: List[MeshtasticNode]


class MeshSimulation:
    """Lightweight runtime that coordinates cats and dogs on a grid."""

    update_interval_seconds: float = 0.75

    def __init__(
        self,
        width: int = 25,
        height: int = 25,
        *,
        cat_count: int = 5,
        dog_count: int = 1,
        log_callback: Optional[Callable[[str], None]] = None,
        random_seed: Optional[int] = None,
    ) -> None:
        if not isinstance(width, int) or width <= 0:
            raise ValueError("width must be a positive integer")
        if not isinstance(height, int) or height <= 0:
            raise ValueError("height must be a positive integer")
        if width < 3 or height < 3:
            raise ValueError("Grid dimensions must be at least 3x3 to accommodate the border")
        if not isinstance(cat_count, int) or cat_count < 0:
            raise ValueError("cat_count must be a non-negative integer")
        if not isinstance(dog_count, int) or dog_count < 0:
            raise ValueError("dog_count must be a non-negative integer")
        if cat_count + dog_count > width * height:
            raise ValueError("Total number of agents cannot exceed available tiles")

        self._grid = SimulationGrid(width=width, height=height)
        self._log = log_callback or _default_logger
        self._environment = GridWorldEnvironment(
            width,
            height,
            log_callback=self._log,
        )
        self._rng = random.Random(random_seed)
        self._tick = 0
        self._cat_idle_chance = 0.25
        self._dog_idle_chance = 0.45
        self._dog_move_interval = 3

        occupied: CoordinateSet = set()
        self._cats = self._spawn_agents(
            prefix="cat",
            count=cat_count,
            occupied=occupied,
        )
        self._dogs = self._spawn_agents(
            prefix="dog",
            count=dog_count,
            occupied=occupied,
        )

        self._log(
            f"Initialized mesh simulation: {cat_count} cats, {dog_count} dogs on {width}x{height} grid"
        )

    def snapshot(self) -> SimulationSnapshot:
        """Return a serializable snapshot of the current world state."""

        return SimulationSnapshot(
            grid=self._grid,
            cats=list(self._cats),
            dogs=list(self._dogs)
        )

    def step(self) -> SimulationSnapshot:
        """Advance the simulation and return the resulting snapshot."""

        self._tick += 1

        occupied_for_cats = {
            (dog.location.x, dog.location.y) for dog in self._dogs
        }
        self._cats = self._advance_group(
            self._cats,
            occupied_for_cats,
            idle_probability=self._cat_idle_chance,
        )

        occupied_for_dogs: CoordinateSet = {
            (cat.location.x, cat.location.y) for cat in self._cats
        }
        occupied_for_dogs.update(
            (dog.location.x, dog.location.y) for dog in self._dogs
        )

        dog_idle_probability = (
            self._dog_idle_chance
            if self._tick % self._dog_move_interval == 0
            else 1.0
        )
        self._dogs = self._advance_group(
            self._dogs,
            occupied_for_dogs,
            idle_probability=dog_idle_probability,
        )

        self._log(f"Simulation tick advanced to {self._tick}")
        return self.snapshot()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _spawn_agents(
        self,
        *,
        prefix: str,
        count: int,
        occupied: CoordinateSet,
    ) -> List[MeshtasticNode]:
        agents: List[MeshtasticNode] = []
        for index in range(count):
            location = self._random_location(occupied)
            identifier = f"{prefix}-{index + 1}"
            node = MeshtasticNode(
                identifier=identifier,
                battery_level=round(self._rng.uniform(62.0, 98.0), 2),
                compute_efficiency_flops_per_milliamp=round(
                    self._rng.uniform(6_000.0, 18_000.0),
                    2,
                ),
                location=location,
            )
            occupied.add((location.x, location.y))
            agents.append(node)
        return agents

    def _random_location(self, occupied: CoordinateSet) -> GridLocation:
        attempts = 0
        interior_width = self._grid.width - 2
        interior_height = self._grid.height - 2
        limit = max(1, interior_width * interior_height * 2)
        while attempts < limit:
            attempts += 1
            candidate = GridLocation(
                1 + self._rng.randrange(interior_width),
                1 + self._rng.randrange(interior_height),
            )
            if (candidate.x, candidate.y) not in occupied:
                return candidate

        for y in range(1, self._grid.height - 1):
            for x in range(1, self._grid.width - 1):
                if (x, y) not in occupied:
                    return GridLocation(x, y)

        raise RuntimeError("Unable to place additional agents on the grid")

    def _advance_group(
        self,
        nodes: Sequence[MeshtasticNode],
        occupied: CoordinateSet,
        *,
        idle_probability: float,
    ) -> List[MeshtasticNode]:
        updated: List[MeshtasticNode] = []
        for node in nodes:
            occupied.discard((node.location.x, node.location.y))
            next_node = self._move_node(
                node,
                occupied,
                idle_probability=idle_probability,
            )
            occupied.add((next_node.location.x, next_node.location.y))
            updated.append(next_node)
        return updated

    def _move_node(
        self,
        node: MeshtasticNode,
        occupied: CoordinateSet,
        *,
        idle_probability: float,
    ) -> MeshtasticNode:
        idle_probability = float(idle_probability)
        idle_probability = min(max(idle_probability, 0.0), 1.0)

        if self._rng.random() < idle_probability:
            return self._drain_battery(node)

        surroundings = self._environment.surroundings_for(node.location)
        actions = list(surroundings.available_actions())

        if not actions:
            return self._drain_battery(node)

        self._rng.shuffle(actions)

        for action in actions:
            _, candidate, _, _ = self._environment.step(node, int(action))
            position = (candidate.location.x, candidate.location.y)
            if position in occupied:
                continue
            return self._drain_battery(candidate)

        return self._drain_battery(node)

    def _drain_battery(self, node: MeshtasticNode) -> MeshtasticNode:
        drain_amount = self._rng.uniform(0.05, 0.35)
        new_level = max(node.battery_level - drain_amount, 0.0)
        return node.with_battery_level(round(new_level, 2))


__all__ = [
    "MeshSimulation",
    "SimulationGrid",
    "SimulationSnapshot",
]
