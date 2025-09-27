"""Core logic utilities for the Compotastic simulation."""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import replace
from enum import IntEnum
from typing import Callable
from typing import Dict
from typing import Iterable
from typing import List
from typing import Optional
from typing import Sequence
from typing import Tuple

import random

from dataclasses_json import dataclass_json


@dataclass_json
@dataclass(frozen=True)
class LogicProbe:
    """Lightweight object used to verify simulation logic imports."""

    name: str = "simulation.logic"

    def is_available(self) -> bool:
        """Return True to indicate the logic module is importable."""

        return True


@dataclass_json
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


class Action(IntEnum):
    """Integer encoded actions available to agents exploring the grid."""

    MOVE_FORWARD = 0
    MOVE_BACKWARD = 1
    MOVE_LEFT = 2
    MOVE_RIGHT = 3
    DO_WORK = 4
    STOP = 5
    CALL_FOR_HELP = 6


_ACTION_TO_VECTOR: Dict[Action, Tuple[int, int]] = {
    Action.MOVE_FORWARD: (0, -1),
    Action.MOVE_BACKWARD: (0, 1),
    Action.MOVE_LEFT: (-1, 0),
    Action.MOVE_RIGHT: (1, 0),
}


def _default_logger(message: str) -> None:
    """No-op logger used when a caller does not provide a callback."""

    # Intentionally left blank – satisfies the logging callback contract.
    return None


@dataclass(frozen=True)
class Surroundings:
    """Represents which integer encoded actions are currently available."""

    can_move_forward: bool
    can_move_backward: bool
    can_move_left: bool
    can_move_right: bool
    can_do_work: bool
    can_stop: bool
    can_call_for_help: bool

    def __post_init__(self) -> None:
        for field_name, value in self.__dict__.items():
            if not isinstance(value, bool):
                raise TypeError(f"{field_name} must be a boolean")

    def action_mask(self) -> int:
        """Return an integer mask encoding the available actions."""

        flags = (
            self.can_move_forward,
            self.can_move_backward,
            self.can_move_left,
            self.can_move_right,
            self.can_do_work,
            self.can_stop,
            self.can_call_for_help,
        )
        mask = 0
        for index, is_allowed in enumerate(flags):
            if is_allowed:
                mask |= 1 << index
        return mask

    def available_actions(self) -> List[int]:
        """Return the integer identifiers for actions that can be taken."""

        actions = []
        if self.can_move_forward:
            actions.append(Action.MOVE_FORWARD)
        if self.can_move_backward:
            actions.append(Action.MOVE_BACKWARD)
        if self.can_move_left:
            actions.append(Action.MOVE_LEFT)
        if self.can_move_right:
            actions.append(Action.MOVE_RIGHT)
        if self.can_do_work:
            actions.append(Action.DO_WORK)
        if self.can_stop:
            actions.append(Action.STOP)
        if self.can_call_for_help:
            actions.append(Action.CALL_FOR_HELP)
        return [int(action) for action in actions]


@dataclass(frozen=True)
class NodeState:
    """Encapsulates the location and surroundings for Q-learning."""

    location: GridLocation
    surroundings: Surroundings

    def encode(self, grid_width: int) -> int:
        """Encode the state as an integer for table based learning."""

        if not isinstance(grid_width, int) or grid_width <= 0:
            raise ValueError("grid_width must be a positive integer")
        position_index = self.location.y * grid_width + self.location.x
        surroundings_mask = self.surroundings.action_mask()
        return position_index * (1 << len(Action)) + surroundings_mask


@dataclass_json
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


class GridWorldEnvironment:
    """Simple integer-based grid used to train reinforcement learning agents."""

    def __init__(
        self,
        width: int,
        height: int,
        rewards: Optional[Dict[Tuple[int, int], int]] = None,
        log_callback: Optional[Callable[[str], None]] = None,
    ) -> None:
        if not isinstance(width, int) or width <= 0:
            raise ValueError("width must be a positive integer")
        if not isinstance(height, int) or height <= 0:
            raise ValueError("height must be a positive integer")
        self.width = width
        self.height = height
        self._rewards = {
            (int(x), int(y)): int(value)
            for (x, y), value in (rewards or {}).items()
        }
        self._log = log_callback or _default_logger
        self._node_states: Dict[str, MeshtasticNode] = {}

    def _within_bounds(self, location: GridLocation) -> bool:
        return 0 <= location.x < self.width and 0 <= location.y < self.height

    def _is_border(self, location: GridLocation) -> bool:
        return (
            location.x == 0
            or location.y == 0
            or location.x == self.width - 1
            or location.y == self.height - 1
        )

    def is_passable(self, location: GridLocation) -> bool:
        """Return True when the location is within the traversable interior."""

        return self._within_bounds(location) and not self._is_border(location)

    def surroundings_for(self, location: GridLocation) -> Surroundings:
        """Return the available actions for a node at the supplied location."""

        if not self._within_bounds(location):
            raise ValueError("location must be within the grid bounds")
        if self._is_border(location):
            raise ValueError("location must not be on the impassable border")
        return Surroundings(
            can_move_forward=self.is_passable(location.translated(0, -1)),
            can_move_backward=self.is_passable(location.translated(0, 1)),
            can_move_left=self.is_passable(location.translated(-1, 0)),
            can_move_right=self.is_passable(location.translated(1, 0)),
            can_do_work=True,
            can_stop=True,
            can_call_for_help=True,
        )

    def encode_state(self, location: GridLocation) -> int:
        """Encode the state represented by a location and its surroundings."""

        surroundings = self.surroundings_for(location)
        return NodeState(location, surroundings).encode(self.width)

    def reward_at(self, location: GridLocation) -> int:
        """Return the reward associated with the given grid location."""

        return self._rewards.get((location.x, location.y), 0)

    def step(
        self,
        node: MeshtasticNode,
        action: int,
    ) -> Tuple[int, MeshtasticNode, int, bool]:
        """Apply an integer encoded action to the node and return the outcome."""

        if not isinstance(action, int):
            raise TypeError("action must be provided as an integer")
        try:
            resolved_action = Action(action)
        except ValueError as exc:
            raise ValueError(f"Unknown action: {action}") from exc

        active_node = self._node_states.get(node.identifier)
        if active_node is None:
            active_node = node
        else:
            if (
                node.battery_level != active_node.battery_level
                or node.compute_efficiency_flops_per_milliamp
                != active_node.compute_efficiency_flops_per_milliamp
            ):
                active_node = replace(
                    active_node,
                    battery_level=node.battery_level,
                    compute_efficiency_flops_per_milliamp=
                        node.compute_efficiency_flops_per_milliamp,
                )
        self._node_states[node.identifier] = active_node

        surroundings = self.surroundings_for(active_node.location)
        available_actions = surroundings.available_actions()
        if action not in available_actions:
            self._log(
                f"Action {resolved_action.name} is unavailable at location {active_node.location}"
            )
            self._node_states[node.identifier] = active_node
            return self.encode_state(active_node.location), active_node, -1, False

        if resolved_action in _ACTION_TO_VECTOR:
            dx, dy = _ACTION_TO_VECTOR[resolved_action]
            new_location = active_node.location.translated(dx, dy)
            if not self.is_passable(new_location):
                self._log(
                    "Attempted to move into impassable border at %s", new_location
                )
                self._node_states[node.identifier] = active_node
                return self.encode_state(active_node.location), active_node, -1, False
            reward = self.reward_at(new_location)
            updated_node = active_node.with_location(new_location)
            self._node_states[node.identifier] = updated_node
            return self.encode_state(new_location), updated_node, reward, False

        if resolved_action is Action.DO_WORK:
            reward = self.reward_at(active_node.location)
            self._node_states[node.identifier] = active_node
            return self.encode_state(active_node.location), active_node, reward, False

        if resolved_action is Action.STOP:
            self._node_states[node.identifier] = active_node
            return self.encode_state(active_node.location), active_node, 0, True

        if resolved_action is Action.CALL_FOR_HELP:
            self._log(
                f"Node {node.identifier} requested assistance at {active_node.location}"
            )
            self._node_states[node.identifier] = active_node
            return self.encode_state(active_node.location), active_node, -1, False

        self._node_states[node.identifier] = active_node
        return self.encode_state(active_node.location), active_node, 0, False


class QLearningAgent:
    """Integer based Q-learning implementation for grid exploration."""

    def __init__(
        self,
        learning_rate: float = 0.1,
        discount_factor: float = 0.9,
        exploration_rate: float = 0.1,
        log_callback: Optional[Callable[[str], None]] = None,
    ) -> None:
        if not 0 < learning_rate <= 1:
            raise ValueError("learning_rate must be within the range (0, 1]")
        if not 0 <= discount_factor <= 1:
            raise ValueError("discount_factor must be within the range [0, 1]")
        if not 0 <= exploration_rate <= 1:
            raise ValueError("exploration_rate must be within the range [0, 1]")
        self.learning_rate = float(learning_rate)
        self.discount_factor = float(discount_factor)
        self.exploration_rate = float(exploration_rate)
        self._log = log_callback or _default_logger
        self._q_table: Dict[int, Dict[int, float]] = {}

    def get_q_value(self, state: int, action: int) -> float:
        """Return the Q-value for the given integer state-action pair."""

        return self._q_table.get(state, {}).get(action, 0.0)

    def _set_q_value(self, state: int, action: int, value: float) -> None:
        state_values = self._q_table.setdefault(state, {})
        state_values[action] = float(value)

    def choose_action(
        self,
        state: int,
        available_actions: Sequence[int],
        exploration_rate: Optional[float] = None,
    ) -> int:
        """Select an action using an epsilon-greedy policy."""

        if not available_actions:
            raise ValueError("available_actions must not be empty")
        epsilon = self.exploration_rate if exploration_rate is None else float(exploration_rate)
        if epsilon < 0 or epsilon > 1:
            raise ValueError("exploration_rate must be within the range [0, 1]")
        if random.random() < epsilon:
            return int(random.choice(list(available_actions)))
        best_action = int(available_actions[0])
        best_value = self.get_q_value(state, best_action)
        for candidate in available_actions[1:]:
            candidate_value = self.get_q_value(state, int(candidate))
            if candidate_value > best_value:
                best_value = candidate_value
                best_action = int(candidate)
        return best_action

    def learn(
        self,
        state: int,
        action: int,
        reward: float,
        next_state: int,
        next_available_actions: Optional[Sequence[int]] = None,
    ) -> None:
        """Update the Q-table based on an observed transition."""

        current_q = self.get_q_value(state, action)
        next_values = [
            self.get_q_value(next_state, int(next_action))
            for next_action in next_available_actions or []
        ]
        best_next_q = max(next_values) if next_values else 0.0
        updated_q = (1 - self.learning_rate) * current_q + self.learning_rate * (
            reward + self.discount_factor * best_next_q
        )
        self._set_q_value(state, action, updated_q)

    def policy(self, state: int) -> Optional[int]:
        """Return the greedy action for the supplied state if it exists."""

        state_actions = self._q_table.get(state)
        if not state_actions:
            return None
        return max(state_actions, key=state_actions.get)


__all__ = [
    "LogicProbe",
    "GridLocation",
    "MeshtasticNode",
    "validate_unique_identifiers",
    "Action",
    "Surroundings",
    "NodeState",
    "GridWorldEnvironment",
    "QLearningAgent",
]
