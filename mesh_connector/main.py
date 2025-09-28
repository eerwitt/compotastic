"""Command line utility for discovering and connecting to Meshtastic BLE devices."""

from __future__ import annotations

import argparse
import logging
import random
import sys
import time
from contextlib import ExitStack
from pathlib import Path
from typing import Iterable, Iterator, List, Optional, Tuple

from google.protobuf.json_format import MessageToDict
from meshtastic.ble_interface import BLEDevice, BLEInterface

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

try:  # noqa: WPS229 - import guard keeps optional dependency optional at runtime
    from backend.simulation.logic import (  # type: ignore
        Action,
        GridLocation,
        GridWorldEnvironment,
        MeshtasticNode,
    )
except ImportError as exc:  # pragma: no cover - exercised when backend package is absent
    Action = GridLocation = GridWorldEnvironment = MeshtasticNode = None  # type: ignore
    SIMULATION_IMPORT_ERROR: Optional[Exception] = exc
else:
    SIMULATION_IMPORT_ERROR = None

from mesh_connector.protos import AddressableMeshData, StateUpdate

LOGGER_NAME = "mesh_connector.main"
DEFAULT_LOG_LEVEL = "INFO"
LOG_LEVELS = ["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"]

PROTOCOL_VERSION = 1
APPLICATION_ID = 0x434F4D50  # ASCII 'COMP'
SOURCE_ADDRESS = 0x000001
BROADCAST_ADDRESS = 0x000000
DEFAULT_MESH_DEVICE_COUNT = 30
SIMULATION_INTERVAL_SECONDS = 2.0
DEFAULT_MAX_UPDATES = 5


def parse_arguments() -> argparse.Namespace:
    """Parse command line arguments for the Meshtastic BLE utility."""
    parser = argparse.ArgumentParser(
        description="Discover and connect to Meshtastic nodes over BLE."
    )
    parser.add_argument(
        "--node-id",
        dest="node_id",
        help=(
            "Identifier for the Meshtastic device to connect to. This can be the "
            "BLE advertised name or the device address."
        ),
    )
    parser.add_argument(
        "--list-nodes",
        action="store_true",
        help=(
            "List available Meshtastic nodes even when --node-id is provided. "
            "When --node-id is omitted, listing always occurs."
        ),
    )
    parser.add_argument(
        "--log-level",
        default=DEFAULT_LOG_LEVEL,
        choices=LOG_LEVELS,
        help="Logging verbosity for the utility output.",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> logging.Logger:
    """Configure the root logger and return the module logger."""
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    return logging.getLogger(LOGGER_NAME)


def log_device_metadata(logger: logging.Logger, metadata: Iterable[tuple[str, object]]) -> None:
    """Write BLE metadata details to the logger."""
    has_metadata = False
    for key, value in metadata:
        has_metadata = True
        logger.info("    %s: %s", key, value)
    if not has_metadata:
        logger.info("    No additional BLE metadata available.")


def list_available_devices(logger: logging.Logger) -> None:
    """Scan for and list available Meshtastic BLE devices."""
    logger.info("Scanning for Meshtastic BLE devices...")
    devices: List[BLEDevice] = BLEInterface.scan()
    if not devices:
        logger.info("No Meshtastic BLE devices found.")
        return

    logger.info("Found %s device(s).", len(devices))
    for index, device in enumerate(devices, start=1):
        logger.info("Device %s:", index)
        logger.info("    Name: %s", device.name or "<unknown>")
        logger.info("    Address: %s", device.address)
        device_metadata = sorted((device.metadata or {}).items())
        log_device_metadata(logger, device_metadata)


def inspect_device(logger: logging.Logger, node_identifier: str) -> None:
    """Connect to a specific Meshtastic node and log device metadata."""
    logger.info("Connecting to Meshtastic device '%s' over BLE...", node_identifier)
    with ExitStack() as stack:
        interface = BLEInterface(node_identifier)
        stack.callback(interface.close)

        logger.info("Connected to device '%s'.", node_identifier)

        if interface.myInfo is not None:
            info_dict = MessageToDict(
                interface.myInfo, preserving_proto_field_name=True
            )
            for key, value in sorted(info_dict.items()):
                logger.info("Device info %s: %s", key, value)
        else:
            logger.info("Device information has not been received yet.")

        logger.info("Requesting device metadata...")
        interface.localNode.getMetadata()
        if interface.metadata is not None:
            metadata_dict = MessageToDict(
                interface.metadata, preserving_proto_field_name=True
            )
            for key, value in sorted(metadata_dict.items()):
                logger.info("Metadata %s: %s", key, value)
        else:
            logger.info("No metadata was returned by the device.")

        stream_state_updates(interface, logger)


def stream_state_updates(
    interface: BLEInterface,
    logger: logging.Logger,
    *,
    device_count: int = DEFAULT_MESH_DEVICE_COUNT,
    interval_seconds: float = SIMULATION_INTERVAL_SECONDS,
    max_updates: Optional[int] = DEFAULT_MAX_UPDATES,
) -> None:
    """Generate reinforcement learning updates and transmit them across the mesh."""

    if SIMULATION_IMPORT_ERROR is not None or GridWorldEnvironment is None:
        logger.error(
            "Simulation logic could not be loaded: %s", SIMULATION_IMPORT_ERROR
        )
        return

    logger.info(
        "Starting simulated reinforcement learning updates for %s mesh devices.",
        device_count,
    )
    total_bytes = 0
    updates_sent = 0
    generator = _generate_state_updates(logger)

    try:
        for sequence_id, update in enumerate(generator, start=1):
            if max_updates is not None and sequence_id > max_updates:
                break
            state_update, action_value, reward, done = update
            envelope = AddressableMeshData(
                protocol_version=PROTOCOL_VERSION,
                application_id=APPLICATION_ID,
                source_address=SOURCE_ADDRESS,
                destination_address=BROADCAST_ADDRESS,
                sequence_id=sequence_id,
                state_update=state_update,
            )
            payload = envelope.SerializeToString()

            if hasattr(interface, "sendData"):
                send_callable = interface.sendData
            elif hasattr(interface, "localNode") and hasattr(interface.localNode, "sendData"):
                send_callable = interface.localNode.sendData
            else:  # pragma: no cover - depends on meshtastic runtime availability
                logger.error("Meshtastic interface does not expose a sendData method")
                return

            try:
                send_callable(payload)
            except Exception as exc:  # pragma: no cover - depends on runtime transport
                logger.error("Failed to send state update %s: %s", sequence_id, exc)
                return

            bytes_sent = len(payload)
            total_bytes += bytes_sent
            updates_sent = sequence_id
            action_name = _resolve_action_name(action_value)
            logger.info(
                "Sent state update seq=%s action=%s reward=%s done=%s (%s bytes)",
                sequence_id,
                action_name,
                reward,
                done,
                bytes_sent,
            )
            stats = _calculate_mesh_energy(bytes_sent, device_count)
            logger.info(
                "Estimated mesh energy for %s devices: tx=%.6fAh rx=%.6fAh total=%.6fAh",
                device_count,
                stats["tx_amp_hours"],
                stats["rx_amp_hours"],
                stats["total_amp_hours"],
            )
            logger.debug("Transmission statistics: %s", stats)
            time.sleep(interval_seconds)
    except KeyboardInterrupt:  # pragma: no cover - manual interruption
        logger.info("State update streaming interrupted by user")

    logger.info(
        "Completed transmission of %s simulated state updates (%s bytes total).",
        updates_sent,
        total_bytes,
    )


def _generate_state_updates(
    logger: logging.Logger,
    *,
    rng_seed: Optional[int] = None,
) -> Iterator[Tuple[StateUpdate, int, int, bool]]:
    """Yield protobuf state updates derived from the simulation environment."""

    if GridWorldEnvironment is None or MeshtasticNode is None:
        raise RuntimeError("Simulation environment is unavailable")

    rng = random.Random(rng_seed)
    environment, node = _create_environment(logger)
    prior_state = environment.encode_state(node.location)

    while True:
        surroundings = environment.surroundings_for(node.location)
        available_actions = surroundings.available_actions()
        selectable_actions = [
            action for action in available_actions if action != int(Action.STOP)
        ]
        if not selectable_actions:
            selectable_actions = available_actions

        if not selectable_actions:
            logger.warning(
                "No available actions for node %s; resetting simulation environment",
                node.identifier,
            )
            environment, node = _create_environment(logger)
            prior_state = environment.encode_state(node.location)
            continue

        action_value = rng.choice(selectable_actions)
        next_state_id, updated_node, reward, done = environment.step(
            node, action_value
        )
        packed_transition = _pack_transition(
            updated_node.location, action_value, reward, done
        )
        state_update = StateUpdate(
            packed_transition=packed_transition,
            prior_state_id=prior_state,
            next_state_id=next_state_id,
        )
        action_name = _resolve_action_name(action_value)
        logger.debug(
            "Simulated transition: prior=%s next=%s action=%s reward=%s done=%s",
            prior_state,
            next_state_id,
            action_name,
            reward,
            done,
        )

        yield state_update, action_value, reward, done

        node = updated_node
        prior_state = next_state_id

        if done:
            logger.info(
                "Simulation reached terminal condition; reinitialising environment."
            )
            environment, node = _create_environment(logger)
            prior_state = environment.encode_state(node.location)


def _create_environment(logger: logging.Logger) -> Tuple[GridWorldEnvironment, MeshtasticNode]:
    """Construct a fresh grid environment and simulated mesh node."""

    if GridWorldEnvironment is None or MeshtasticNode is None:
        raise RuntimeError("Simulation environment is unavailable")

    rewards = {
        (3, 3): 8,
        (8, 8): 5,
        (5, 7): -3,
    }
    environment = GridWorldEnvironment(
        12,
        12,
        rewards=rewards,
        log_callback=logger.debug,
    )
    node = MeshtasticNode(
        identifier="sim-node-1",
        battery_level=96.0,
        compute_efficiency_flops_per_milliamp=12_500.0,
        location=GridLocation(6, 6),
    )
    return environment, node


def _pack_transition(
    location: GridLocation,
    action_value: int,
    reward: int,
    done: bool,
) -> int:
    """Pack the transition details into the fixed width protobuf field."""

    x = max(0, min(1023, int(location.x)))
    y = max(0, min(1023, int(location.y)))
    action_bits = int(action_value) & 0b111
    done_bit = 1 if done else 0
    reward_clamped = max(-128, min(127, int(reward)))
    reward_bits = reward_clamped & 0xFF
    return (
        x
        | (y << 10)
        | (action_bits << 20)
        | (done_bit << 23)
        | (reward_bits << 24)
    )


def _calculate_mesh_energy(
    bytes_sent: int,
    device_count: int,
    *,
    data_rate_bps: float = 9600.0,
    tx_current_ma: float = 120.0,
    rx_current_ma: float = 45.0,
) -> dict[str, float]:
    """Estimate amp-hour usage for transmitting payloads across the mesh."""

    if device_count < 1:
        raise ValueError("device_count must be a positive integer")
    if data_rate_bps <= 0:
        raise ValueError("data_rate_bps must be positive")

    bits_sent = bytes_sent * 8
    tx_time_seconds = bits_sent / data_rate_bps
    rx_time_seconds = tx_time_seconds * max(device_count - 1, 0)
    tx_amp_hours = (tx_current_ma / 1000.0) * (tx_time_seconds / 3600.0)
    rx_amp_hours = (rx_current_ma / 1000.0) * (rx_time_seconds / 3600.0)
    total_amp_hours = tx_amp_hours + rx_amp_hours
    return {
        "bits_sent": float(bits_sent),
        "tx_time_seconds": float(tx_time_seconds),
        "rx_time_seconds": float(rx_time_seconds),
        "tx_amp_hours": float(tx_amp_hours),
        "rx_amp_hours": float(rx_amp_hours),
        "total_amp_hours": float(total_amp_hours),
    }


def _resolve_action_name(action_value: int) -> str:
    """Return a human readable action name for logging purposes."""

    if Action is None:
        return str(action_value)
    member = Action._value2member_map_.get(int(action_value))  # type: ignore[attr-defined]
    return member.name if member is not None else str(action_value)


def main() -> None:
    """Run the Meshtastic BLE connector utility."""
    args = parse_arguments()
    logger = configure_logging(args.log_level)

    should_list = args.node_id is None or args.list_nodes
    if should_list:
        list_available_devices(logger)

    if args.node_id:
        inspect_device(logger, args.node_id)


if __name__ == "__main__":
    main()
