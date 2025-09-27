"""Unit tests for the integer based Q-learning utilities."""

from __future__ import annotations

import unittest

from simulation.logic import Action
from simulation.logic import GridLocation
from simulation.logic import GridWorldEnvironment
from simulation.logic import MeshtasticNode
from simulation.logic import NodeState
from simulation.logic import QLearningAgent
from simulation.logic import Surroundings


class SurroundingsTests(unittest.TestCase):
    """Verify that surroundings encode and expose actions correctly."""

    def test_action_mask_and_available_actions(self) -> None:
        surroundings = Surroundings(
            can_move_forward=True,
            can_move_backward=False,
            can_move_left=True,
            can_move_right=False,
            can_do_work=True,
            can_stop=True,
            can_call_for_help=True,
        )
        self.assertEqual(surroundings.action_mask(), 117)
        self.assertEqual(
            set(surroundings.available_actions()),
            {
                int(Action.MOVE_FORWARD),
                int(Action.MOVE_LEFT),
                int(Action.DO_WORK),
                int(Action.STOP),
                int(Action.CALL_FOR_HELP),
            },
        )


class NodeStateTests(unittest.TestCase):
    """Ensure node states produce deterministic integer encodings."""

    def test_state_encoding_uses_position_and_surroundings(self) -> None:
        surroundings = Surroundings(
            can_move_forward=True,
            can_move_backward=True,
            can_move_left=True,
            can_move_right=True,
            can_do_work=True,
            can_stop=True,
            can_call_for_help=False,
        )
        state = NodeState(GridLocation(1, 1), surroundings)
        # Expected value: ((1 * 5) + 1) * 128 + mask(=63)
        self.assertEqual(state.encode(5), 768 + 63)


class GridWorldEnvironmentTests(unittest.TestCase):
    """Validate grid transitions and reward propagation."""

    def test_step_moves_node_and_returns_reward(self) -> None:
        env = GridWorldEnvironment(width=5, height=5, rewards={(2, 1): 5, (2, 2): 2})
        node = MeshtasticNode(
            identifier="node-1",
            battery_level=75.0,
            compute_efficiency_flops_per_milliamp=10.0,
            location=GridLocation(2, 2),
        )
        state_id = env.encode_state(node.location)
        next_state, updated_node, reward, done = env.step(node, int(Action.MOVE_FORWARD))
        self.assertFalse(done)
        self.assertEqual(updated_node.location, GridLocation(2, 1))
        self.assertEqual(reward, 5)
        self.assertNotEqual(state_id, next_state)

    def test_unavailable_action_penalizes_agent(self) -> None:
        env = GridWorldEnvironment(width=4, height=4)
        node = MeshtasticNode(
            identifier="node-edge",
            battery_level=60.0,
            compute_efficiency_flops_per_milliamp=8.0,
            location=GridLocation(1, 1),
        )
        state_id, updated_node, reward, done = env.step(node, int(Action.MOVE_FORWARD))
        self.assertEqual(state_id, env.encode_state(node.location))
        self.assertEqual(updated_node.location, node.location)
        self.assertEqual(reward, -1)
        self.assertFalse(done)

    def test_step_resumes_from_last_tracked_location(self) -> None:
        env = GridWorldEnvironment(width=5, height=5)
        node = MeshtasticNode(
            identifier="node-1",
            battery_level=80.0,
            compute_efficiency_flops_per_milliamp=12.0,
            location=GridLocation(2, 2),
        )

        _, moved_node, _, _ = env.step(node, int(Action.MOVE_FORWARD))
        self.assertEqual(moved_node.location, GridLocation(2, 1))

        _, next_node, _, _ = env.step(node, int(Action.MOVE_RIGHT))
        self.assertEqual(next_node.location, GridLocation(3, 1))


class QLearningAgentTests(unittest.TestCase):
    """Confirm the Q-learning agent updates values correctly."""

    def test_learn_updates_q_values(self) -> None:
        agent = QLearningAgent(learning_rate=0.5, discount_factor=0.5, exploration_rate=0.0)
        state = 10
        next_state = 20
        agent.learn(state, int(Action.DO_WORK), reward=5, next_state=next_state, next_available_actions=[])
        self.assertAlmostEqual(agent.get_q_value(state, int(Action.DO_WORK)), 2.5)
        self.assertEqual(agent.policy(state), int(Action.DO_WORK))

    def test_choose_action_prefers_best_q_value(self) -> None:
        agent = QLearningAgent(learning_rate=0.5, discount_factor=0.9, exploration_rate=0.0)
        state = 42
        agent.learn(state, int(Action.MOVE_FORWARD), reward=1, next_state=state, next_available_actions=[])
        agent.learn(state, int(Action.DO_WORK), reward=3, next_state=state, next_available_actions=[])
        choice = agent.choose_action(
            state,
            [
                int(Action.MOVE_FORWARD),
                int(Action.DO_WORK),
                int(Action.STOP),
            ],
            exploration_rate=0.0,
        )
        self.assertEqual(choice, int(Action.DO_WORK))


if __name__ == "__main__":
    unittest.main()
