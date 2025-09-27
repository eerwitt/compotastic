import unittest

from simulation.logic import LogicProbe


class LogicProbeTests(unittest.TestCase):
    def test_probe_reports_available(self) -> None:
        probe = LogicProbe()
        self.assertTrue(probe.is_available())
        self.assertEqual("simulation.logic", probe.name)


if __name__ == "__main__":
    unittest.main()
