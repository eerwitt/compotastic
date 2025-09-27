"""Runtime helpers for driving the realtime mesh simulation."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple, Union

from dataclasses_json import dataclass_json

from .logic import Action
from .logic import GridLocation
from .logic import GridWorldEnvironment
from .logic import MeshtasticNode
from .logic import QLearningAgent
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
    alerts: Dict[str, str]


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
        self._alerts: Dict[str, str] = {}
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
        self._models: Dict[str, QLearningAgent] = {}

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
            alerts=dict(self._alerts),
        )

    @property
    def environment(self) -> GridWorldEnvironment:
        """Expose the underlying environment for reinforcement learning."""

        return self._environment

    def set_models(self, models: Mapping[str, QLearningAgent]) -> None:
        """Replace the registered Q-learning models for simulation nodes."""

        validated: Dict[str, QLearningAgent] = {}
        for identifier, model in models.items():
            if not isinstance(identifier, str) or not identifier.strip():
                raise ValueError("Model identifiers must be non-empty strings")
            if not isinstance(model, QLearningAgent):
                raise TypeError("Models must be provided as QLearningAgent instances")
            validated[identifier] = model
        self._models = validated
        if validated:
            self._log(
                f"Registered {len(validated)} Q-learning model(s) for mesh simulation"
            )

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
            agent_type="cat",
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
            agent_type="dog",
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
        agent_type: str,
        idle_probability: float,
    ) -> List[MeshtasticNode]:
        updated: List[MeshtasticNode] = []
        for node in nodes:
            occupied.discard((node.location.x, node.location.y))
            next_node = self._move_node(
                node,
                occupied,
                agent_type=agent_type,
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
        agent_type: str,
        idle_probability: float,
    ) -> MeshtasticNode:
        idle_probability = float(idle_probability)
        idle_probability = min(max(idle_probability, 0.0), 1.0)

        if self._rng.random() < idle_probability:
            if agent_type == "dog":
                self._clear_alert(node.identifier)
            return self._drain_battery(node)

        surroundings = self._environment.surroundings_for(node.location)
        actions = list(surroundings.available_actions())

        if not actions:
            return self._handle_no_available_actions(node, agent_type)

        if agent_type == "cat":
            reward_here = self._environment.reward_at(node.location)
            if reward_here > 0 and int(Action.DO_WORK) in actions:
                self._log(
                    f"Cat {node.identifier} discovered reward tile worth {reward_here} at {node.location}"
                )
                _, working_node, reward, _ = self._environment.step(
                    node,
                    int(Action.DO_WORK),
                )
                self._consume_reward_tile(working_node.location, reward)
                self._broadcast_state_update(working_node, reward)
                return self._drain_battery(working_node)

        ranked_actions = self._rank_actions(
            node,
            actions,
            allow_stop=agent_type != "cat",
        )

        for action in ranked_actions:
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

            _, candidate, _, _ = self._environment.step(node, int(action))
            if agent_type == "dog":
                self._clear_alert(node.identifier)
            return self._drain_battery(candidate)

        if agent_type == "cat":
            return self._fallback_cat_action(node, actions, occupied)

        return self._handle_no_viable_action(node, reason="No viable action from trained model")

    def _rank_actions(
        self,
        node: MeshtasticNode,
        available_actions: Sequence[int],
        *,
        allow_stop: bool,
    ) -> List[int]:
        filtered_actions = [
            int(action)
            for action in available_actions
            if allow_stop or int(action) != int(Action.STOP)
        ]

        model = self._models.get(node.identifier)
        if model is None:
            self._log(
                f"[mesh-warning] Node {node.identifier} lacks a trained model; broadcasting stop request"
            )
            self._broadcast_model_request(node)
            return [int(Action.STOP)] if allow_stop else []

        try:
            state = self._environment.encode_state(node.location)
        except ValueError:
            self._log(
                f"[mesh-warning] Unable to encode state for node {node.identifier}; requesting assistance"
            )
            self._broadcast_model_request(node)
            return [int(Action.STOP)] if allow_stop else []

        policy_action = model.policy(state)
        if policy_action is None:
            self._log(
                f"[mesh-warning] Model for node {node.identifier} has no policy; requesting assistance"
            )
            self._broadcast_model_request(node)
            return [int(Action.STOP)] if allow_stop else []

        ranked = sorted(
            filtered_actions if filtered_actions else [int(action) for action in available_actions],
            key=lambda action: model.get_q_value(state, int(action)),
            reverse=True,
        )

        preferred_action = int(policy_action)
        if not allow_stop and preferred_action == int(Action.STOP):
            preferred_action = next(
                (action for action in ranked if action != int(Action.STOP)),
                None,
            )

        if not ranked or preferred_action is None or preferred_action not in ranked:
            self._log(
                f"[mesh-warning] Model for node {node.identifier} proposed unavailable action; requesting assistance"
            )
            self._broadcast_model_request(node)
            return [int(Action.STOP)] if allow_stop else []

        ordered_actions = [preferred_action]
        ordered_actions.extend(action for action in ranked if action != preferred_action)
        return ordered_actions

    def _fallback_cat_action(
        self,
        node: MeshtasticNode,
        available_actions: Sequence[int],
        occupied: CoordinateSet,
    ) -> MeshtasticNode:
        movement_actions = [
            int(action)
            for action in available_actions
            if int(action) in {int(a) for a in _ACTION_TO_VECTOR}
        ]
        if movement_actions:
            self._rng.shuffle(movement_actions)
            for action in movement_actions:
                resolved = Action(int(action))
                dx, dy = _ACTION_TO_VECTOR[resolved]
                candidate_position = (
                    node.location.x + dx,
                    node.location.y + dy,
                )
                if candidate_position in occupied:
                    continue
                _, candidate, _, _ = self._environment.step(node, int(action))
                return self._drain_battery(candidate)

        if int(Action.DO_WORK) in available_actions:
            _, working_node, _, _ = self._environment.step(
                node,
                int(Action.DO_WORK),
            )
            return self._drain_battery(working_node)

        self._log(
            f"[mesh-info] Cat {node.identifier} maintaining position due to lack of viable actions"
        )
        return self._drain_battery(node)

    def _handle_no_available_actions(
        self,
        node: MeshtasticNode,
        agent_type: str,
    ) -> MeshtasticNode:
        if agent_type == "dog":
            return self._handle_no_viable_action(
                node,
                reason="Dog has no available actions",
            )

        self._log(
            f"[mesh-info] Cat {node.identifier} encountered no available actions; remaining on station"
        )
        return self._drain_battery(node)

    def _handle_no_viable_action(
        self,
        node: MeshtasticNode,
        *,
        reason: str,
    ) -> MeshtasticNode:
        self._set_alert(node.identifier, reason)
        return self._enter_stop_state(node, reason=reason)

    def _enter_stop_state(
        self,
        node: MeshtasticNode,
        *,
        reason: str,
    ) -> MeshtasticNode:
        self._log(f"[mesh-warning] {reason} for node {node.identifier}")
        self._broadcast_model_request(node)
        _, halted_node, _, _ = self._environment.step(node, int(Action.STOP))
        return self._drain_battery(halted_node)

    def _broadcast_model_request(self, node: MeshtasticNode) -> None:
        self._log(
            f"Node {node.identifier} is requesting updated Q-learning model via mesh network"
        )

    def _broadcast_state_update(self, node: MeshtasticNode, reward: int) -> None:
        self._log(
            f"Node {node.identifier} broadcast state update after consuming reward {reward} at {node.location}"
        )

    def _consume_reward_tile(self, location: GridLocation, reward_value: int) -> None:
        if reward_value == 0:
            return
        self._environment.set_reward(location, 0)
        self._reward_tiles = [
            tile for tile in self._reward_tiles if tile.location != location
        ]

    def _set_alert(self, identifier: str, message: str) -> None:
        self._alerts[identifier] = message
        self._log(
            f"[mesh-info] Node {identifier} entered alert state: {message}"
        )

    def _clear_alert(self, identifier: str) -> None:
        if identifier in self._alerts:
            self._alerts.pop(identifier, None)
            self._log(f"[mesh-info] Node {identifier} cleared alert state")

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
