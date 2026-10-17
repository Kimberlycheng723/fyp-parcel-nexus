import { createParcelRoom, getParcelRoom, listParcelRooms, updateParcelRoom } from "../services/parcelRoom.service.js";
import { PARCEL_ROOM_ERROR_RESPONSES } from "../utils/parcelRoomValidation.js";

function respond(res, result, successStatus = 200) {
  if (!result.error) return res.status(successStatus).json(result);
  const [status, message] = result.error === "FORBIDDEN"
    ? [403, "You do not have permission to manage parcel rooms."]
    : PARCEL_ROOM_ERROR_RESPONSES[result.error] || [500, "Unable to complete parcel room request."];
  return res.status(status).json({ message });
}

export async function listRooms(req, res) {
  return respond(res, await listParcelRooms({ requester: req.user }));
}
export async function listActiveRooms(req, res) {
  return respond(res, await listParcelRooms({ requester: req.user, activeOnly: true }));
}
export async function getRoom(req, res) {
  return respond(res, await getParcelRoom({ requester: req.user, roomId: req.params.roomId }));
}
export async function createRoom(req, res) {
  return respond(res, await createParcelRoom({ requester: req.user, input: req.body }), 201);
}
export async function updateRoom(req, res) {
  return respond(res, await updateParcelRoom({ requester: req.user, roomId: req.params.roomId, input: req.body }));
}
export async function updateRoomStatus(req, res) {
  return respond(res, await updateParcelRoom({ requester: req.user, roomId: req.params.roomId, input: req.body, statusOnly: true }));
}
