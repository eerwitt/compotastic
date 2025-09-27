"""Tests for the realtime mesh simulation runtime helpers."""

from __future__ import annotations

import json

from unittest.mock import patch

from simulation.logic import Action
from simulation.logic import GridLocation
from simulation.logic import QLearningAgent
from simulation.runtime import MeshSimulation


def test_snapshot_serializes_to_json() -> None:
    simulation = MeshSimulation(
        width=5,
        height=5,
        cat_count=2,
        dog_count=1,
        random_seed=42,
        reward_tiles=[(2, 2, 3)],
    )

    snapshot = simulation.snapshot()
    encoded = snapshot.to_json()
    payload = json.loads(encoded)

    assert payload["grid"]["width"] == 5
    assert payload["grid"]["height"] == 5
    assert len(payload["cats"]) == 2
    assert len(payload["dogs"]) == 1
    assert payload["rewards"] == [
        {
            "location": {"x": 2, "y": 2},
            "value": 3,
        }
    ]


def test_agents_remain_within_grid_bounds() -> None:
    simulation = MeshSimulation(width=4, height=4, cat_count=1, dog_count=1, random_seed=1)

    for _ in range(5):
        snapshot = simulation.step()
        cat = snapshot.cats[0]
        dog = snapshot.dogs[0]

        assert 0 < cat.location.x < 3
        assert 0 < cat.location.y < 3
        assert 0 < dog.location.x < 3
        assert 0 < dog.location.y < 3


def test_add_reward_tile_updates_environment() -> None:
    simulation = MeshSimulation(width=5, height=5, cat_count=0, dog_count=0, random_seed=3)

    location = GridLocation(2, 2)
    simulation.add_reward_tile(location, 4)
    snapshot = simulation.snapshot()

    assert any(tile.location == location and tile.value == 4 for tile in snapshot.rewards)
    assert simulation.environment.reward_at(location) == 4

    simulation.add_reward_tile(location, -2)
    assert simulation.environment.reward_at(location) == -2


def test_move_node_skips_occupied_tiles_without_side_effects() -> None:
    simulation = MeshSimulation(width=5, height=5, cat_count=1, dog_count=0, random_seed=5)

    cat = simulation.snapshot().cats[0].with_location(GridLocation(2, 2))
    simulation._cats = [cat]
    simulation.environment._node_states[cat.identifier] = cat

    occupied = {(2, 1)}

    class ControlledRandom:
        def random(self) -> float:
            return 0.9

        def shuffle(self, sequence) -> None:
            return None

        def uniform(self, start: float, end: float) -> float:
            return start

        def randrange(self, upper: int) -> int:
            return 0

    simulation._rng = ControlledRandom()

    with patch.object(simulation._environment, "step", wraps=simulation._environment.step) as step_spy:
        updated = simulation._move_node(cat, occupied, idle_probability=0.0)

    assert step_spy.call_count == 1
    assert (updated.location.x, updated.location.y) != (2, 1)
    env_state = simulation.environment._node_states[cat.identifier]
    assert env_state.location == updated.location


def test_move_node_uses_registered_model_policy() -> None:
    simulation = MeshSimulation(width=5, height=5, cat_count=1, dog_count=0, random_seed=11)

    cat = simulation.snapshot().cats[0].with_location(GridLocation(2, 2))
    simulation._cats = [cat]
    simulation.environment._node_states[cat.identifier] = cat

    agent = QLearningAgent(exploration_rate=0.0)
    state = simulation.environment.encode_state(cat.location)
    agent.learn(
        state,
        int(Action.MOVE_RIGHT),
        reward=1.0,
        next_state=state,
        next_available_actions=[int(Action.MOVE_RIGHT)],
    )

    simulation.set_models({cat.identifier: agent})

    class PredictableRandom:
        def random(self) -> float:
            return 0.99

        def uniform(self, start: float, end: float) -> float:
            return start

        def randrange(self, upper: int) -> int:
            return 0

    simulation._rng = PredictableRandom()

    updated = simulation._move_node(cat, set(), idle_probability=0.0)

    assert updated.location.x == cat.location.x + 1
    assert updated.location.y == cat.location.y


def test_move_node_requests_model_when_untrained() -> None:
    simulation = MeshSimulation(width=5, height=5, cat_count=1, dog_count=0, random_seed=13)

    cat = simulation.snapshot().cats[0].with_location(GridLocation(2, 2))
    simulation._cats = [cat]
    simulation.environment._node_states[cat.identifier] = cat

    messages = []

    def capture(message: str) -> None:
        messages.append(message)

    simulation._log = capture

    class PredictableRandom:
        def random(self) -> float:
            return 0.99

        def uniform(self, start: float, end: float) -> float:
            return start

        def randrange(self, upper: int) -> int:
            return 0

    simulation._rng = PredictableRandom()

    with patch.object(simulation._environment, "step", wraps=simulation._environment.step) as step_spy:
        updated = simulation._move_node(cat, set(), idle_probability=0.0)

    assert step_spy.call_count == 1
    _, action = step_spy.call_args[0][0:2]
    assert action == int(Action.STOP)
    assert updated.location == cat.location
    assert any("lacks a trained model" in message for message in messages)
    assert any("requesting updated Q-learning model" in message for message in messages)
