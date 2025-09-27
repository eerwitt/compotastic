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

## Mesh Coordination in Practice

The ASCII snapshots below illustrate how Compotastic orchestrates heterogeneous devices inside the mesh when one of the low-power nodes encounters a task that exceeds its capabilities.

```
+-----------------------+----------------------------------------+---------------------------------------------+-----------------------------------------------------------+
| Node                  | Hardware                               | Status                                      | Action                                                    |
+=======================+========================================+=============================================+===========================================================+
| Cat Alpha =^.^=       | ARM® Cortex®-M4 with FPU               | Streaming environmental telemetry           | Relays summaries and keeps mesh heartbeat steady          |
|                       | 1 MB flash / 256 kB RAM                |                                             |                                                           |
+-----------------------+----------------------------------------+---------------------------------------------+-----------------------------------------------------------+
| Cat Beta /\_/\        | ARM® Cortex®-M4 with FPU               | Blocked on ML inference; requesting compute | Broadcasting assist ping and waiting for policy refresh   |
|                       | 1 MB flash / 256 kB RAM                |                                             |                                                           |
+-----------------------+----------------------------------------+---------------------------------------------+-----------------------------------------------------------+
| Cat Gamma (=^･ω･^=)   | ARM® Cortex®-M4 with FPU               | Buffering sensor batches for swarm replay   | Holding results until Cat Beta clears the queue           |
|                       | 1 MB flash / 256 kB RAM                |                                             |                                                           |
+-----------------------+----------------------------------------+---------------------------------------------+-----------------------------------------------------------+
| Compot U•ᴥ•U          | Jetson Thor accelerator, LTE backhaul  | Mobile HQ with large battery reserves       | --> Targeting Cat Beta /\_/\ to deliver compute & firmware |
| (service dog)         | Caches foundation model deltas         |                                             | Synchronizes swarm ledger while en route                  |
+-----------------------+----------------------------------------+---------------------------------------------+-----------------------------------------------------------+
```

Compot (the mesh service dog) homes in on Cat Beta after detecting the compute request, leveraging its Jetson Thor attachment and network reach to ship the needed model fragments.

The next zoomed-in chart captures how Compot and Cat Beta synchronize state, update the Q-learning policy, and resume execution after Compot processes imagery via the OpenAI Realtime API.

```
+--------------------------+----------------------------------------------------+-----------------------------------------------------------+------------------------------------------------------+
| Participant              | Synchronization Step                               | Q-Learning & Model Update                                 | Post-Action Result                                   |
+==========================+====================================================+===========================================================+======================================================+
| Compot U•ᴥ•U             | Captures blockage frame; runs OpenAI Realtime API  | Adds new obstacle state to Q-learning map; retunes policy | Queues mesh-safe delta packets for distribution      |
|                          | for rapid scene understanding                      | weights to avoid repeat stalls                            |                                                      |
+--------------------------+----------------------------------------------------+-----------------------------------------------------------+------------------------------------------------------+
| Cat Beta /\_/\           | Shares stalled task context and sensor traces      | Receives updated state slice and assisted execution plan  | Resumes inference using Compot's augmented compute   |
|                          |                                                    |                                                           | overlay                                              |
+--------------------------+----------------------------------------------------+-----------------------------------------------------------+------------------------------------------------------+
| Mesh Sync Channel  --->  | Confirms OTA slot, timestamps, and energy budgets  | Commits shared policy delta to distributed registry       | Broadcasts success acknowledgement to the swarm      |
+--------------------------+----------------------------------------------------+-----------------------------------------------------------+------------------------------------------------------+
```

Together, the devices maintain a resilient learning loop where high-compute resources opportunistically uplift low-power peers without breaking the mesh-first workflow.

## Getting Started

### Backend setup

The simulation backend is written in Python and targets Python **3.12**. The
commands below create an isolated virtual environment, install the required
dependencies, and launch the websocket server that drives the UI.

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

The UI is built with Vite and Phaser. To run it in development mode or produce
an optimized build, use the commands below from the `ui` directory.

```bash
cd ui
npm install

# Start the Vite development server
npm run dev

# Build the production bundle
npm run build
```

## Future Enhancements

- Adaptive prioritization of compute requests based on mission profiles (search & rescue, environmental monitoring).
- Integration with satellite backhaul for long-range coordination.
- Federated learning support for on-mesh incremental updates without central aggregation.

## License

This project is distributed under the terms of the [MIT License](LICENSE).
