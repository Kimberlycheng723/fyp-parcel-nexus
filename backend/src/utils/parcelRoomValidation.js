export const PARCEL_ROOM_ERROR_RESPONSES = {
  PARCEL_ROOM_REQUIRED: [400, "Parcel room is required for each new parcel."],
  INVALID_PARCEL_ROOM_ID: [400, "Parcel room ID must be a valid UUID."],
  PARCEL_ROOM_NOT_FOUND: [404, "Parcel room was not found."],
  PARCEL_ROOM_INACTIVE: [400, "Select an active parcel room."],
  PARCEL_ROOM_NAME_REQUIRED: [400, "Parcel room name is required."],
  INVALID_PARCEL_ROOM_NAME: [400, "Parcel room name must be text with at most 100 characters."],
  INVALID_PARCEL_ROOM_DESCRIPTION: [400, "Parcel room description must be text with at most 1000 characters, or null."],
  PARCEL_ROOM_ALREADY_EXISTS: [409, "A parcel room with this name already exists."],
  INVALID_PARCEL_ROOM_STATUS: [400, "is_active must be a boolean."],
  INVALID_PARCEL_ROOM_INPUT: [400, "Provide only the supported parcel room fields."]
};

export function validateParcelRoomId(value) {
  if (value === undefined || value === null || value === "") return { error: "PARCEL_ROOM_REQUIRED" };
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())) {
    return { error: "INVALID_PARCEL_ROOM_ID" };
  }
  return { parcelRoomId: value.trim().toLowerCase() };
}

export function validateParcelRoomInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !["name", "description"].includes(key))
    || (partial && Object.keys(input).length === 0)) return { error: "INVALID_PARCEL_ROOM_INPUT" };
  const value = {};
  if (!partial || Object.hasOwn(input, "name")) {
    if (typeof input.name !== "string") return { error: input.name === undefined ? "PARCEL_ROOM_NAME_REQUIRED" : "INVALID_PARCEL_ROOM_NAME" };
    value.name = input.name.trim().replace(/\s+/g, " ");
    if (!value.name) return { error: "PARCEL_ROOM_NAME_REQUIRED" };
    if (value.name.includes("\u0000") || Array.from(value.name).length > 100) return { error: "INVALID_PARCEL_ROOM_NAME" };
  }
  if (Object.hasOwn(input, "description")) {
    if (input.description !== null && typeof input.description !== "string") return { error: "INVALID_PARCEL_ROOM_DESCRIPTION" };
    value.description = input.description?.trim() || null;
    if (value.description && (value.description.includes("\u0000") || Array.from(value.description).length > 1000)) return { error: "INVALID_PARCEL_ROOM_DESCRIPTION" };
  }
  return { value };
}
