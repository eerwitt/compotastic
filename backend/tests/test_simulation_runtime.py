"""Tests for the realtime mesh simulation runtime helpers."""

from __future__ import annotations

import json

from unittest.mock import patch

from simulation.logic import Action
from simulation.logic import GridLocation
from simulation.logic import QLearningAgent
from simulation.logic import Surroundings
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
    assert payload["alerts"] == {}


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


def test_dog_without_model_eventually_moves() -> None:
    simulation = MeshSimulation(width=5, height=5, cat_count=0, dog_count=1, random_seed=7)

    initial = simulation.snapshot().dogs[0].location

    moved = False
    for _ in range(10):
        snapshot = simulation.step()
        current = snapshot.dogs[0].location
        if current != initial:
            moved = True
            break

    assert moved, "Dog should explore the grid even without a trained model"


def test_snapshot_nodes_allow_location_updates() -> None:
    simulation = MeshSimulation(width=5, height=5, cat_count=1, dog_count=0, random_seed=19)

    snapshot = simulation.snapshot()
    cat = snapshot.cats[0]

    target_location = GridLocation(2, 2)
    if target_location == cat.location:
        target_location = GridLocation(3, 2)

    cat.location = target_location

    with patch.object(simulation._environment, "step", wraps=simulation._environment.step) as step_spy:
        simulation.step()

    cat_calls = [
        call_args
        for call_args in step_spy.call_args_list
        if call_args.args[0].identifier == cat.identifier
    ]
    assert cat_calls, "Expected environment step to process the updated node"
    moved_node = cat_calls[0].args[0]
    assert moved_node.location == target_location


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
        updated = simulation._move_node(
            cat,
            occupied,
            agent_type="cat",
            idle_probability=0.0,
        )

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

        def shuffle(self, sequence) -> None:
            return None

    simulation._rng = PredictableRandom()

    updated = simulation._move_node(
        cat,
        set(),
        agent_type="cat",
        idle_probability=0.0,
    )

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

        def shuffle(self, sequence) -> None:
            return None

    simulation._rng = PredictableRandom()

    with patch.object(simulation._environment, "step", wraps=simulation._environment.step) as step_spy:
        updated = simulation._move_node(
            cat,
            set(),
            agent_type="cat",
            idle_probability=0.0,
        )

    assert step_spy.call_count == 1
    _, action = step_spy.call_args[0][0:2]
    assert action != int(Action.STOP)
    assert updated.location != cat.location
    assert any("lacks a trained model" in message for message in messages)
    assert any("requesting updated Q-learning model" in message for message in messages)


def test_cat_consumes_reward_and_broadcasts_update() -> None:
    simulation = MeshSimulation(
        width=5,
        height=5,
        cat_count=1,
        dog_count=0,
        random_seed=17,
        reward_tiles=[(2, 2, 4)],
    )

    messages: list[str] = []

    def capture(message: str) -> None:
        messages.append(message)

    simulation._log = capture

    cat = simulation.snapshot().cats[0].with_location(GridLocation(2, 2))
    simulation._cats = [cat]
    simulation.environment._node_states[cat.identifier] = cat

    class DeterministicRandom:
        def random(self) -> float:
            return 0.99

        def uniform(self, start: float, end: float) -> float:
            return start

        def randrange(self, upper: int) -> int:
            return 0

        def shuffle(self, sequence) -> None:
            return None

    simulation._rng = DeterministicRandom()

    updated = simulation._move_node(
        cat,
        set(),
        agent_type="cat",
        idle_probability=0.0,
    )

    assert simulation.environment.reward_at(GridLocation(2, 2)) == 0
    assert all(tile.location != GridLocation(2, 2) for tile in simulation._reward_tiles)
    assert any("broadcast state update" in message for message in messages)
    assert updated.location == cat.location


def test_dog_without_actions_sets_alert_status() -> None:
    simulation = MeshSimulation(width=5, height=5, cat_count=0, dog_count=1, random_seed=23)

    messages: list[str] = []

    def capture(message: str) -> None:
        messages.append(message)

    simulation._log = capture

    dog = simulation.snapshot().dogs[0].with_location(GridLocation(2, 2))
    simulation._dogs = [dog]
    simulation.environment._node_states[dog.identifier] = dog

    class DeterministicRandom:
        def random(self) -> float:
            return 0.99

        def uniform(self, start: float, end: float) -> float:
            return start

        def randrange(self, upper: int) -> int:
            return 0

        def shuffle(self, sequence) -> None:
            return None

    simulation._rng = DeterministicRandom()

    no_actions = Surroundings(
        can_move_forward=False,
        can_move_backward=False,
        can_move_left=False,
        can_move_right=False,
        can_do_work=False,
        can_stop=False,
        can_call_for_help=False,
    )

    with patch.object(simulation._environment, "surroundings_for", return_value=no_actions):
        with patch.object(simulation._environment, "step", wraps=simulation._environment.step) as step_spy:
            updated = simulation._move_node(
                dog,
                set(),
                agent_type="dog",
                idle_probability=0.0,
            )

    assert step_spy.call_count == 1
    assert updated.location == dog.location
    assert simulation.snapshot().alerts.get(dog.identifier)
    assert any("entered alert state" in message for message in messages)
