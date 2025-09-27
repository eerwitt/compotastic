"""Tests for the realtime mesh simulation runtime helpers."""

from __future__ import annotations

import json

from simulation.logic import GridLocation
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
