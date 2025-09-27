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

## Future Enhancements

- Adaptive prioritization of compute requests based on mission profiles (search & rescue, environmental monitoring).
- Integration with satellite backhaul for long-range coordination.
- Federated learning support for on-mesh incremental updates without central aggregation.

## License

This project is distributed under the terms of the [MIT License](LICENSE).
