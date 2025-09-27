# Compotastic: Mesh-Native Compute Layer for Meshtastic Swarms

Compotastic is a hackathon project that transforms swarms of ultra-low-power, Meshtastic-enabled devices into a cooperative compute layer capable of running modern AI foundation models. By layering a lightweight coordination protocol on top of Meshtastic's resilient mesh, the platform orchestrates model execution, state synchronization, and over-the-air (OTA) updates even when individual devices have minimal processing power.

## Why Compotastic?
- **Mesh-native by design** – Works on top of Meshtastic radios, so devices remain connected without cellular or Wi-Fi infrastructure.
- **Compute pooling** – Devices advertise their strengths and request help from nearby peers, sharing workloads across the swarm.
- **Resilient AI access** – Foundation models can be executed in the field by opportunistically syncing with passing high-compute nodes.
- **Minimal footprint** – Only deltas and configuration metadata traverse the mesh, keeping bandwidth use tiny and energy requirements low.

## System Architecture
Compotastic spans heterogeneous devices and leverages both the Meshtastic data plane and Bluetooth Low Energy (BLE) discovery:

1. **Mesh Protocol Layer**
   - Extends Meshtastic with a custom message profile for capability discovery, job scheduling, and state deltas.
   - Synchronizes minimal state updates, allowing microcontrollers to remain up to date without transferring bulky binaries.

2. **BLE Capability Registry**
   - Each node exposes BLE GATT attributes that summarize available accelerators (GPU, NPU), model families, precision support, and battery status.
   - Nearby peers can quickly request compute offloading or pre/post-processing services based on these attributes.

3. **High-Compute Edge Nodes**
   - More powerful devices (laptops, Jetsons, etc.) periodically join the mesh.
   - They compile and package model-specific firmware images and push them OTA to low-spec nodes that request assistance.

4. **Firmware & Model Pipeline**
   - Upon receiving a job request, a high-compute node performs model fine-tuning or inference.
   - The resulting optimized firmware bundle is transmitted over Meshtastic, updating low-end devices with the necessary weights and inference logic.

## Protocol Simulation
This repository includes a protocol simulation that demonstrates:
- How nodes register BLE GATT attributes and share them over the mesh.
- Negotiation of compute jobs and delegation to a capable peer.
- OTA propagation of newly built firmware artifacts.
- Recovery flows when nodes drop off the mesh or battery levels fall below thresholds.

Refer to the `simulation/` directory for implementation examples and sample traces that illustrate the protocol's behavior under varying network conditions and device capabilities.

## Getting Started
1. **Hardware assumptions**
   - Meshtastic-compatible radios (e.g., LILYGO T-Beam).
   - BLE-capable microcontrollers or SBCs (ESP32, Raspberry Pi).
   - At least one high-compute companion node able to run foundation models.

2. **Firmware workflow**
   - Devices boot with a minimal Compotastic runtime that handles BLE advertisement and Meshtastic messaging.
   - High-compute nodes monitor for GATT advertisements and mesh requests, then build and serve OTA firmware tailored to the requesting device.

3. **Simulation**
   - Use the provided simulation scripts to emulate mesh traffic and job negotiation without hardware.
   - Adjust latency, bandwidth, and node availability parameters to validate resilience in different environments (urban canyons, disaster zones, etc.).

## Development Environment

Compotastic's Python components target **Python 3.11**. Use the provided `requirements.txt` to install the base dependencies required for the Arcade-powered simulation prototype and its browser build pipeline.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Building the Arcade Web Demo

An example Arcade scene is available under `examples/arcade_web/`. You can run it on the desktop with:

```bash
python examples/arcade_web/main.py
```

To generate a browser-ready build using [pygbag](https://github.com/pygame-web/pygbag), run:

```bash
pygbag --build examples/arcade_web/main.py
```

The command outputs an HTML bundle in `build/web/` that can be served with any static web host.

## Future Enhancements
- Adaptive prioritization of compute requests based on mission profiles (search & rescue, environmental monitoring).
- Integration with satellite backhaul for long-range coordination.
- Federated learning support for on-mesh incremental updates without central aggregation.

## License
This project is distributed under the terms of the [MIT License](LICENSE).
