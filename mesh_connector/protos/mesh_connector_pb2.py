"""Lightweight runtime protobuf bindings for the Compotastic mesh connector."""

from __future__ import annotations

from google.protobuf import descriptor_pb2 as _descriptor_pb2
from google.protobuf import descriptor_pool as _descriptor_pool
from google.protobuf import message as _message
from google.protobuf import reflection as _reflection
from google.protobuf import symbol_database as _symbol_database

_sym_db = _symbol_database.Default()

_FILE_NAME = "mesh_connector.proto"


def _build_file_descriptor() -> None:
    """Register the mesh connector proto definitions with the descriptor pool."""

    pool = _descriptor_pool.Default()
    try:
        pool.FindFileByName(_FILE_NAME)
        return
    except KeyError:
        pass

    file_proto = _descriptor_pb2.FileDescriptorProto()
    file_proto.name = _FILE_NAME
    file_proto.package = "compotastic.mesh"
    file_proto.syntax = "proto3"
    file_proto.dependency.append("meshtastic/mesh.proto")

    state_update = file_proto.message_type.add()
    state_update.name = "StateUpdate"

    field = state_update.field.add()
    field.name = "packed_transition"
    field.number = 1
    field.label = _descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    field.type = _descriptor_pb2.FieldDescriptorProto.TYPE_FIXED32

    field = state_update.field.add()
    field.name = "prior_state_id"
    field.number = 2
    field.label = _descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    field.type = _descriptor_pb2.FieldDescriptorProto.TYPE_UINT32

    field = state_update.field.add()
    field.name = "next_state_id"
    field.number = 3
    field.label = _descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    field.type = _descriptor_pb2.FieldDescriptorProto.TYPE_UINT32

    addressable = file_proto.message_type.add()
    addressable.name = "AddressableMeshData"

    field = addressable.field.add()
    field.name = "protocol_version"
    field.number = 1
    field.label = _descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    field.type = _descriptor_pb2.FieldDescriptorProto.TYPE_UINT32

    field = addressable.field.add()
    field.name = "application_id"
    field.number = 2
    field.label = _descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    field.type = _descriptor_pb2.FieldDescriptorProto.TYPE_UINT32

    field = addressable.field.add()
    field.name = "source_address"
    field.number = 3
    field.label = _descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    field.type = _descriptor_pb2.FieldDescriptorProto.TYPE_UINT32

    field = addressable.field.add()
    field.name = "destination_address"
    field.number = 4
    field.label = _descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    field.type = _descriptor_pb2.FieldDescriptorProto.TYPE_UINT32

    field = addressable.field.add()
    field.name = "sequence_id"
    field.number = 5
    field.label = _descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    field.type = _descriptor_pb2.FieldDescriptorProto.TYPE_UINT32

    payload_oneof = addressable.oneof_decl.add()
    payload_oneof.name = "payload"

    field = addressable.field.add()
    field.name = "state_update"
    field.number = 16
    field.label = _descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    field.type = _descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE
    field.type_name = ".compotastic.mesh.StateUpdate"
    field.oneof_index = 0

    pool.Add(file_proto)


_build_file_descriptor()

DESCRIPTOR = _descriptor_pool.Default().FindFileByName(_FILE_NAME)

STATEUPDATE = DESCRIPTOR.message_types_by_name["StateUpdate"]
ADDRESSABLEMESHDATA = DESCRIPTOR.message_types_by_name["AddressableMeshData"]


StateUpdate = _reflection.GeneratedProtocolMessageType(
    "StateUpdate",
    (_message.Message,),
    {
        "DESCRIPTOR": STATEUPDATE,
        "__module__": __name__,
    },
)
_sym_db.RegisterMessage(StateUpdate)


AddressableMeshData = _reflection.GeneratedProtocolMessageType(
    "AddressableMeshData",
    (_message.Message,),
    {
        "DESCRIPTOR": ADDRESSABLEMESHDATA,
        "__module__": __name__,
    },
)
_sym_db.RegisterMessage(AddressableMeshData)


__all__ = ["AddressableMeshData", "StateUpdate"]

