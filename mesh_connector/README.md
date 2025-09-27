# Meshtastic Connector

This is the actual connector and executor that can connect to the different Meshtastic nodes and send across a message in compute format including updates for the Q-learning state that each node reads from. For the hackathon the Q-learning implementation is in the simulation only and the attributes are faked for each node on the mesh.

## Protocol buffers

The connector publishes application data in the Meshtastic `MeshPacket.data` field using the [`protos/mesh_connector.proto`](protos/mesh_connector.proto) definition. The top-level `AddressableMeshData` wrapper adds compact addressing and sequencing metadata on top of Meshtastic's routing so each Compotastic node can quickly determine whether the payload is relevant.

### Generating Python bindings

Run the protocol compiler whenever the `.proto` schema changes so that the mesh connector keeps its generated classes in sync. From the repository root, execute:

Install [protoc](https://github.com/protocolbuffers/protobuf/releases)

```bash
python -m grpc_tools.protoc \
  --proto_path=mesh_connector/protos \
  --proto_path=$(python -c "import meshtastic, pathlib; print(pathlib.Path(meshtastic.__file__).resolve().parent)")/protos \
  --python_out=mesh_connector/protos \
  mesh_connector/protos/mesh_connector.proto
```

This command compiles the Compotastic schema while including the Meshtastic package's distributed `.proto` files so imports like `meshtastic/mesh.proto` resolve correctly. The generated Python module will appear alongside the source definition inside `mesh_connector/protos`.

### State updates

`StateUpdate` is the first payload carried within the wrapper. It mirrors the tuple returned by `GridWorldEnvironment.step` in `backend/simulation/logic` while packing the location, action, completion flag, and reward into a single 32-bit field:

- Bits `00-09`: grid X coordinate (0-1023)
- Bits `10-19`: grid Y coordinate (0-1023)
- Bits `20-22`: action identifier from `simulation.logic.Action`
- Bit `23`: `done` flag from the environment step result
- Bits `24-31`: signed reward encoded as two's complement (-128..127)

The original and resulting encoded states are also included so that downstream Q-learning agents can reconstruct table updates without relying on implicit context from the transmission.
