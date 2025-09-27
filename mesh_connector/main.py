"""Command line utility for discovering and connecting to Meshtastic BLE devices."""

from __future__ import annotations

import argparse
import logging
from contextlib import ExitStack
from typing import Iterable, List

from google.protobuf.json_format import MessageToDict
from meshtastic.ble_interface import BLEDevice, BLEInterface

LOGGER_NAME = "mesh_connector.main"
DEFAULT_LOG_LEVEL = "INFO"
LOG_LEVELS = ["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"]


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
