import {
  createResidentCollection,
  verifyGuardCollection
} from "../services/parcelCollection.service.js";
import { emitToUser } from "../realtime/socket.js";

function collectionErrorResponse(error) {
  const responses = {
    RESIDENT_FORBIDDEN: [403, "Only residents can create parcel collection tokens."],
    GUARD_FORBIDDEN: [403, "Only guards can verify parcel collection tokens."],
    PARCELS_REQUIRED: [400, "At least one parcel must be selected."],
    INVALID_PARCEL_SELECTION: [400, "One or more selected parcel IDs are invalid."],
    DUPLICATE_PARCEL_SELECTION: [400, "The same parcel cannot be selected more than once."],
    RESIDENT_UNIT_NOT_FOUND: [404, "Resident unit is not assigned."],
    PARCEL_NOT_FOUND: [404, "One or more selected parcels were not found."],
    PARCEL_ALREADY_COLLECTED: [409, "One or more selected parcels have already been collected."],
    PARCEL_NOT_AVAILABLE: [409, "One or more parcels are no longer available for collection."],
    TOKEN_REQUIRED: [400, "Collection token is required."],
    COLLECTION_NOT_FOUND: [404, "Collection token is invalid."],
    COLLECTION_EXPIRED: [410, "Collection token has expired."],
    COLLECTION_ALREADY_USED: [409, "Collection token has already been used."],
    COLLECTION_CANCELLED: [409, "Collection token has been cancelled."],
    COLLECTION_NOT_AVAILABLE: [409, "Collection token is no longer available."],
    COLLECTION_EMPTY: [409, "Collection does not contain any parcels."],
    COLLECTION_PARCEL_INVALID: [409, "Collection parcels are no longer valid."],
    PARCEL_STATE_CHANGED: [409, "One or more parcels changed before collection could be completed."],
    COLLECTION_STATE_CHANGED: [409, "Collection token changed before verification could be completed."]
  };
  const [status, message] = responses[error] || [500, "Unable to complete parcel collection request."];

  return { status, body: { message } };
}

export async function createCollection(req, res) {
  const result = await createResidentCollection({
    requester: req.user,
    parcelIds: req.body.parcel_ids
  });

  if (result.error) {
    const response = collectionErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.status(201).json(result);
}

export async function verifyCollection(req, res) {
  const result = await verifyGuardCollection({
    requester: req.user,
    token: req.body.token
  });

  if (result.error) {
    const response = collectionErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  const { realtime, ...responseBody } = result;

  if (realtime) {
    emitToUser(
      realtime.recipient_user_id,
      realtime.event,
      realtime.payload
    );
  }

  return res.json(responseBody);
}
