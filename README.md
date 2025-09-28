# Compotastic: Mesh-Native Compute Layer for Meshtastic Swarms

Compotastic began as a hackathon exploration of how ultra-low-power, Meshtastic-enabled devices could pool compute for robotic field work. The repository now hosts a **simulation-only** stack: a Python backend and a Phaser UI mirror the behaviours of deployed nodes so developers can debug coordination logic before touching firmware on the real Q-learning mesh cats and the Compote service dog.【F:backend/README.md†L1-L24】【F:ui/README.md†L1-L10】

## How the demo stack works

- **Protocol simulation backend** – The FastAPI service under `backend/` drives a grid-world environment, synthesises node telemetry, and manages reinforcement-learning state transitions that stand in for the behaviour of on-device agents.【F:backend/api/app.py†L1-L36】【F:backend/simulation/runtime.py†L1-L136】
- **Q-learning agents** – Each simulated node owns a compact integer-based Q-table, allowing the runtime to practise policy updates and reward distribution exactly as the embedded firmware will apply them when Compote ferries new experience across the mesh.【F:backend/simulation/logic/__init__.py†L380-L468】【F:backend/simulation/runtime.py†L98-L181】
- **Meshtastic connector prototype** – The `mesh_connector/` package adds a protobuf envelope (`AddressableMeshData`) that piggybacks on Meshtastic packets to move bin-packed state replicas and coordination requests with minimal airtime.【F:mesh_connector/protos/mesh_connector.proto†L1-L49】
- **Capability beacons** – Every simulated node advertises its accelerators, model support, and energy status through BLE GATT metadata so peers can negotiate workloads and Compote can prioritise which partner to aid.【F:backend/README.md†L5-L24】
- **Web-based visualiser** – The Phaser/Vite UI consumes websocket snapshots to animate the grid, making it easier to narrate how the dogs push firmware and how cats resume their jobs once updated policies arrive.【F:ui/README.md†L1-L10】【F:backend/simulation/runtime.py†L137-L220】

Together, these components illustrate how the real deployment will coordinate Bluetooth and mesh radios without risking physical hardware during rapid iteration.

## Meshtastic integration goals

- **Compotastic protobuf extension** – `StateUpdate` frames align with the `GridWorldEnvironment.step` tuple, letting embedded learners apply the same compressed updates when they receive deltas over Meshtastic or from Compote directly.【F:mesh_connector/protos/mesh_connector.proto†L31-L61】【F:backend/simulation/logic/__init__.py†L360-L420】
- **State replication & job signalling** – The connector binds source/destination addresses and sequence IDs so mesh nodes can deduplicate packets, react to compute help requests, and merge Q-learning tables even when connectivity is intermittent.【F:mesh_connector/protos/mesh_connector.proto†L14-L43】【F:backend/simulation/runtime.py†L221-L280】
- **GATT for capability discovery** – Metadata broadcasts over BLE advertise GPU/NPU availability, firmware versions, and power budget, giving Compote the context it needs before it attempts an OTA push.【F:backend/README.md†L5-L24】

### Snapshot: compute triage on the mesh

```
+-----------------+-----------------+-----------------+-----------------+
| Node A (Cat-07) | Node B (Dog-02) | Node C (Cat-11) | Node D (Cat-04) |
|-----------------|-----------------|-----------------|-----------------|
| Status: NEEDS   | Status: EN ROUTE| Status: WANDER  | Status: TASK    |
| compute assist  | to assist       | patrol          | monitoring crop |
|-----------------|-----------------|-----------------|-----------------|
| Q-load: 92%     | Q-load: 35%     | Q-load: 40%     | Q-load: 58%     |
| Battery: 54%    | Battery: 88%    | Battery: 67%    | Battery: 73%    |
| BLE RSSI: -63 dB| BLE RSSI: -48 dB| BLE RSSI: -71 dB| BLE RSSI: -66 dB|
| Help vector:    | Dispatch role:  | Wandering path: | Task: soil      |
| FFT inference   | Q-table merge   | perimeter sweep | moisture probe  |
| ETA: n/a        | ETA: 02:15 min  | ETA: n/a        | ETA: 06:40 min  |
+-----------------+-----------------+-----------------+-----------------+
```

The ASCII grid mirrors the runtime telemetry: Cat-07 publishes a `NEEDS compute assist` advertisement through the protobuf envelope, Dog-02 acknowledges over Meshtastic before navigating via BLE ranging to perform a Q-table merge, while Cat-11 keeps wandering for weak-signal peers and Cat-04 stays on task sampling soil moisture. This is the same flow Compote will orchestrate on-device once firmware promotion moves beyond the simulator.【F:backend/simulation/runtime.py†L137-L220】【F:mesh_connector/protos/mesh_connector.proto†L14-L49】

Top-down situational map:

```
            +-----------+                      +-----------+
            | Cat-11    |                      | Cat-04    |
            | Wander    |                      | Task Soil |
            +-----------+                      +-----------+


                               ^
                               |
                               |
            +-----------+      |      +-----------+
            | Dog-02    |------>      | Cat-07    |
            | En Route  |  assist     | Needs Help|
            +-----------+             +-----------+
```

Dog-02’s path arrow shows the compute caravan moving across the grid to deliver a Q-table merge to Cat-07 while the other cats maintain their patrol and task assignments.

## Why BLE handles OTA while Meshtastic carries deltas

Meshtastic’s LoRa transport excels at ultra-long-range telemetry, but its data rates (often 0.3–37.5 kbps depending on spreading factor) and multi-second airtime per frame make large binaries impractical. Firmware images for Compotastic nodes quickly exceed LoRa’s effective throughput, so full updates would monopolise the shared mesh and risk missed safety-critical telemetry. Bluetooth Low Energy avoids those constraints: Compote can sidle up to a node, use BLE to transfer multi-hundred-kilobyte firmware within minutes, and then let Meshtastic resume its speciality—broadcasting compact state deltas, coordination pings, and reward updates.

## Next steps: from demo to embedded MLIR

The current simulation and Phaser visualiser were invaluable teaching aids, but the project’s next phase retires these demos in favour of a production-grade embedded implementation:

1. **Transition firmware to MLIR** – LLVM’s Multi-Level IR provides dialect specialisation, aggressive shape-aware optimisation, and pluggable lowering pipelines that can squeeze every cycle from heterogeneous microcontrollers while remaining portable across vendors.
2. **Custom dialects for Compotastic kernels** – Encode reinforcement-learning primitives, GATT advertisement packing, and radio orchestration as MLIR dialects so they can be optimised alongside conventional tensor ops before lowering to target ISAs.
3. **Firmware update pipeline overhaul** – Replace ad-hoc Python packaging with an MLIR-to-bare-metal toolchain that emits OTA-ready binaries tailored to each node’s capabilities and memory limits.
4. **TensorFlow Lite trade-off acknowledgement** – TensorFlow’s micro runtime is a strong baseline, but its arena allocator typically demands >1 MB of pre-reserved RAM, excluding the majority of LoRa-focused boards we plan to support; MLIR lets us deliver equivalent kernels without that footprint.

By narrowing scope to the embedded stack, Compotastic can evolve from a didactic simulator into a resilient compute mesh that pushes frontier models to wherever Compote roams.

## Getting started with the demo (optional)

The remaining instructions help you run the simulation for storytelling or regression testing.

### Backend setup

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

# Start the simulation backend
python simulation/main.py
```

### Frontend UI

```bash
cd ui
npm install

# Start the Vite development server
npm run dev

# Build the production bundle
npm run build
```

## License

This project is distributed under the terms of the [MIT License](LICENSE).
