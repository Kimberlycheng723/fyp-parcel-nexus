export function normalizeRoomName(value) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateRoomForm({ name, description }) {
  const normalizedName = normalizeRoomName(name);
  const normalizedDescription = description.trim();
  const errors = {};
  if (!normalizedName) errors.name = "Room name is required.";
  else if (normalizedName.includes("\u0000") || Array.from(normalizedName).length > 100) errors.name = "Room name must be at most 100 characters.";
  if (normalizedDescription.includes("\u0000") || Array.from(normalizedDescription).length > 1000) errors.description = "Description must be at most 1000 characters.";
  return { errors, input: { name: normalizedName, description: normalizedDescription || null } };
}

export function filterParcelRooms(rooms, search, status) {
  const term = normalizeRoomName(search).toLocaleLowerCase();
  return rooms.filter((room) => room.name.toLocaleLowerCase().includes(term)
    && (status === "ALL" || room.is_active === (status === "ACTIVE")));
}

export function sessionHasActiveRooms(parcels, activeRooms) {
  return parcels.length > 0 && parcels.every((parcel) => activeRooms.some((room) => room.is_active === true && room.id === parcel.parcel_room_id));
}

export function parcelRoomLabel(parcel) {
  return parcel?.parcel_room_name?.trim() || "Not Assigned";
}

export function parcelRoomCsvValue(value) {
  const text = String(value || "Not Assigned");
  return /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
}

export function parcelRoomUpdate(parcel, selectedRoomId, activeRooms) {
  if (!selectedRoomId || selectedRoomId === parcel.parcel_room_id) return { updates: {} };
  if (!activeRooms.some((room) => room.is_active === true && room.id === selectedRoomId)) {
    return { error: "Please select an available active parcel room." };
  }
  return { updates: { parcel_room_id: selectedRoomId } };
}
