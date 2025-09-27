"""Runtime helpers for driving the realtime mesh simulation."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple, Union

from dataclasses_json import dataclass_json

from .logic import Action
from .logic import GridLocation
from .logic import GridWorldEnvironment
from .logic import MeshtasticNode
from .logic import _ACTION_TO_VECTOR
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
class RewardTile:
    """Serializable description of a reward positioned on the grid."""

    location: GridLocation
    value: int


@dataclass_json
@dataclass(frozen=True)
class SimulationSnapshot:
    """Serializable view of the current simulation state."""

    grid: SimulationGrid
    cats: List[MeshtasticNode]
    dogs: List[MeshtasticNode]
    rewards: List[RewardTile]


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
        reward_tiles: Optional[Sequence[Union["RewardTile", Tuple[int, int, int]]]] = None,
        positive_reward_count: int = 0,
        negative_reward_count: int = 0,
        positive_reward_value: int = 5,
        negative_reward_value: int = -5,
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

        if positive_reward_count < 0:
            raise ValueError("positive_reward_count must be non-negative")
        if negative_reward_count < 0:
            raise ValueError("negative_reward_count must be non-negative")

        self._grid = SimulationGrid(width=width, height=height)
        self._log = log_callback or _default_logger
        self._rng = random.Random(random_seed)
        self._reward_tiles = self._initialize_reward_tiles(
            reward_tiles or [],
            positive_reward_count=positive_reward_count,
            negative_reward_count=negative_reward_count,
            positive_reward_value=positive_reward_value,
            negative_reward_value=negative_reward_value,
        )
        self._environment = GridWorldEnvironment(
            width,
            height,
            rewards=self._reward_lookup(),
            log_callback=self._log,
        )
        self._tick = 0
        self._cat_idle_chance = 0.25
        self._dog_idle_chance = 0.45
        self._dog_move_interval = 3
        self._completed_nodes: Set[str] = set()

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
            dogs=list(self._dogs),
            rewards=list(self._reward_tiles),
        )

    @property
    def environment(self) -> GridWorldEnvironment:
        """Expose the underlying environment for reinforcement learning."""

        return self._environment

    def add_reward_tile(self, location: GridLocation, value: int) -> None:
        """Add or update a reward tile on the grid interior."""

        if not isinstance(location, GridLocation):
            raise TypeError("location must be provided as a GridLocation instance")
        if not isinstance(value, int):
            raise TypeError("value must be provided as an integer")
        if not self._is_interior(location):
            raise ValueError("Rewards must be placed within the traversable interior")

        tile = RewardTile(location=location, value=value)
        replaced = False
        updated: List[RewardTile] = []
        for existing in self._reward_tiles:
            if existing.location == location:
                updated.append(tile)
                replaced = True
            else:
                updated.append(existing)
        if not replaced:
            updated.append(tile)
        self._reward_tiles = updated
        self._environment.set_reward(location, value)

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
            if node.identifier in self._completed_nodes:
                stationary_node = self._drain_battery(node)
                occupied.add((stationary_node.location.x, stationary_node.location.y))
                self._environment._node_states[node.identifier] = stationary_node
                updated.append(stationary_node)
                continue

            occupied.discard((node.location.x, node.location.y))
            next_node, completed = self._move_node(
                node,
                occupied,
                idle_probability=idle_probability,
            )
            if completed:
                self._completed_nodes.add(node.identifier)
            else:
                self._completed_nodes.discard(node.identifier)
            occupied.add((next_node.location.x, next_node.location.y))
            updated.append(next_node)
        return updated

    def _move_node(
        self,
        node: MeshtasticNode,
        occupied: CoordinateSet,
        *,
        idle_probability: float,
    ) -> Tuple[MeshtasticNode, bool]:
        idle_probability = float(idle_probability)
        idle_probability = min(max(idle_probability, 0.0), 1.0)

        if self._rng.random() < idle_probability:
            return self._drain_battery(node), False

        surroundings = self._environment.surroundings_for(node.location)
        actions = list(surroundings.available_actions())

        if not actions:
            return self._drain_battery(node), False

        self._rng.shuffle(actions)

        for action in actions:
            try:
                resolved_action = Action(int(action))
            except ValueError:
                continue

            if resolved_action in _ACTION_TO_VECTOR:
                dx, dy = _ACTION_TO_VECTOR[resolved_action]
                candidate_position = (
                    node.location.x + dx,
                    node.location.y + dy,
                )
                if candidate_position in occupied:
                    continue

            _, candidate, _, done = self._environment.step(node, int(action))
            return self._drain_battery(candidate), done

        return self._drain_battery(node), False

    def _drain_battery(self, node: MeshtasticNode) -> MeshtasticNode:
        drain_amount = self._rng.uniform(0.05, 0.35)
        new_level = max(node.battery_level - drain_amount, 0.0)
        return node.with_battery_level(round(new_level, 2))

    # ------------------------------------------------------------------
    # Reward helpers
    # ------------------------------------------------------------------
    def _initialize_reward_tiles(
        self,
        explicit_tiles: Sequence[Union["RewardTile", Tuple[int, int, int]]],
        *,
        positive_reward_count: int,
        negative_reward_count: int,
        positive_reward_value: int,
        negative_reward_value: int,
    ) -> List[RewardTile]:
        tiles: List[RewardTile] = []
        occupied: Set[Tuple[int, int]] = set()

        for tile in explicit_tiles:
            if isinstance(tile, RewardTile):
                location = tile.location
                value = tile.value
            else:
                x, y, value = tile
                location = GridLocation(int(x), int(y))
            if not self._is_interior(location):
                raise ValueError("Reward tiles must be placed within the grid interior")
            coordinate = (location.x, location.y)
            if coordinate in occupied:
                raise ValueError("Duplicate reward tile location specified")
            occupied.add(coordinate)
            tiles.append(RewardTile(location=location, value=int(value)))

        tiles.extend(
            self._generate_random_rewards(
                count=positive_reward_count,
                value=positive_reward_value,
                occupied=occupied,
            )
        )
        tiles.extend(
            self._generate_random_rewards(
                count=negative_reward_count,
                value=negative_reward_value,
                occupied=occupied,
            )
        )
        return tiles

    def _generate_random_rewards(
        self,
        *,
        count: int,
        value: int,
        occupied: Set[Tuple[int, int]],
    ) -> Iterable[RewardTile]:
        for _ in range(count):
            location = self._random_interior_location(occupied)
            occupied.add((location.x, location.y))
            yield RewardTile(location=location, value=int(value))

    def _random_interior_location(self, occupied: Set[Tuple[int, int]]) -> GridLocation:
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

        raise RuntimeError("Unable to place reward tiles on the grid")

    def _is_interior(self, location: GridLocation) -> bool:
        return 0 < location.x < self._grid.width - 1 and 0 < location.y < self._grid.height - 1

    def _reward_lookup(self) -> Dict[Tuple[int, int], int]:
        return {
            (tile.location.x, tile.location.y): int(tile.value)
            for tile in self._reward_tiles
        }


__all__ = [
    "MeshSimulation",
    "SimulationGrid",
    "SimulationSnapshot",
    "RewardTile",
]
