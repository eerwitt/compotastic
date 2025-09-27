# Compotastic Simulation Backend

This repository includes a protocol simulation backend that demonstrates:

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

Compotastic's Python components target **Python 3.12**. Use the provided `requirements.txt` to install the base dependencies required for the Arcade-powered simulation prototype and its browser build pipeline.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Running the backend

```bash
python simulation/main.py
```
