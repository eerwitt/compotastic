"""Tests for the realtime mesh simulation runtime helpers."""

from __future__ import annotations

import json

from simulation.runtime import MeshSimulation


def test_snapshot_serializes_to_json() -> None:
    simulation = MeshSimulation(width=5, height=5, cat_count=2, dog_count=1, random_seed=42)

    snapshot = simulation.snapshot()
    encoded = snapshot.to_json()
    payload = json.loads(encoded)

    assert payload["grid"]["width"] == 5
    assert payload["grid"]["height"] == 5
    assert len(payload["cats"]) == 2
    assert len(payload["dogs"]) == 1
    assert len(payload["ascii_map"]) == 5
    assert all(isinstance(row, str) for row in payload["ascii_map"])


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


def test_ascii_map_draws_brown_border() -> None:
    simulation = MeshSimulation(width=5, height=5, cat_count=1, dog_count=1, random_seed=7)

    snapshot = simulation.snapshot()
    ascii_map = snapshot.ascii_map

    assert len(ascii_map) == 5

    top_row_tokens = ascii_map[0].split(" ")
    bottom_row_tokens = ascii_map[-1].split(" ")
    border_token = top_row_tokens[0]

    assert "\x1b[38;5;94m" in border_token
    assert border_token.endswith("\x1b[0m")
    assert all(token == border_token for token in top_row_tokens)
    assert all(token == border_token for token in bottom_row_tokens)

    for middle_row in ascii_map[1:-1]:
        tokens = middle_row.split(" ")
        assert tokens[0] == border_token
        assert tokens[-1] == border_token
        assert all(token != border_token for token in tokens[1:-1])

    interior_tokens = [token for row in ascii_map[1:-1] for token in row.split(" ")[1:-1]]
    assert any(token in {"C", "D"} for token in interior_tokens)

