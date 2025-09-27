import unittest

from simulation.logic import GridLocation
from simulation.logic import MeshtasticNode
from simulation.logic import validate_unique_identifiers


class MeshtasticNodeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.location = GridLocation(0, 0)
        self.node = MeshtasticNode(
            identifier="alpha",
            battery_level=75.0,
            compute_efficiency_flops_per_milliamp=500.0,
            location=self.location,
        )

    def test_location_translation_returns_new_instance(self) -> None:
        moved = self.node.translated(2, -1)
        self.assertEqual(GridLocation(2, -1), moved.location)
        self.assertEqual(self.location, self.node.location)

    def test_battery_update_validates_range(self) -> None:
        updated = self.node.with_battery_level(50)
        self.assertAlmostEqual(50.0, updated.battery_level)

        with self.assertRaises(ValueError):
            self.node.with_battery_level(150)

    def test_estimate_milliamp_draw(self) -> None:
        self.assertAlmostEqual(0.0, self.node.estimate_milliamp_draw(0))
        self.assertAlmostEqual(2.0, self.node.estimate_milliamp_draw(1000))

    def test_validate_unique_identifiers(self) -> None:
        other = MeshtasticNode(
            identifier="bravo",
            battery_level=55.0,
            compute_efficiency_flops_per_milliamp=300.0,
            location=GridLocation(1, 1),
        )

        validate_unique_identifiers([self.node, other])

        with self.assertRaises(ValueError):
            validate_unique_identifiers([self.node, other.with_location(GridLocation(2, 2)), self.node])


if __name__ == "__main__":
    unittest.main()
