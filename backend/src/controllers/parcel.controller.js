import {
  exportParcels,
  getParcelById,
  getParcelStatusOptions,
  getParcelSummary,
  listParcels,
  softDeleteParcel,
  updateParcel,
  updateParcelStatus
} from "../services/parcel.service.js";

function parcelErrorResponse(error) {
  const responses = {
    FORBIDDEN: [403, "You do not have permission to access parcel management."],
    FORBIDDEN_DELETE: [403, "Only Admin can delete parcel records."],
    FORBIDDEN_EXPORT: [403, "Only Admin can export parcel records."],
    PARCEL_NOT_FOUND: [404, "Parcel record was not found."],
    INVALID_STATUS: [400, "Status filter must be PENDING_COLLECTION, OVERDUE, COLLECTED, or ALL."],
    INVALID_STORED_STATUS: [400, "Parcel status must be PENDING_COLLECTION or COLLECTED."],
    COLLECTION_STATUS_RESTRICTED: [
      400,
      "Collected status will be handled through the Parcel Collection Module."
    ],
    INVALID_DATE_RANGE: [400, "Date range must be last_7_days, last_30_days, last_90_days, or all."],
    TRACKING_NUMBER_REQUIRED: [400, "Tracking number is required."],
    DELIVERY_CONTACT_REQUIRED: [400, "Delivery person contact number is required."],
    COURIER_REQUIRED: [400, "Courier company is required."],
    UNIT_REQUIRED: [400, "Unit is required."],
    COURIER_NOT_FOUND: [404, "Courier company was not found or is not active."],
    UNIT_NOT_FOUND: [404, "Unit was not found."],
    TRACKING_ALREADY_EXISTS: [409, "This tracking number already exists for the selected courier company."],
    INVALID_COLLECTION_DEADLINE: [400, "Collection deadline must be a valid date and time."]
  };

  const [status, message] = responses[error] || [500, "Unable to complete parcel request."];
  return { status, body: { message } };
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function ensureValidParcelId(req, res) {
  const parcelId = req.params.parcelId?.trim();

  if (!isValidUuid(parcelId)) {
    res.status(400).json({
      message: "Parcel ID format is invalid."
    });
    return false;
  }

  req.params.parcelId = parcelId;
  return true;
}

export async function getSummary(req, res) {
  const result = await getParcelSummary({
    requester: req.user
  });

  if (result.error) {
    const response = parcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function listParcelRecords(req, res) {
  const result = await listParcels({
    requester: req.user,
    filters: req.query
  });

  if (result.error) {
    const response = parcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function getParcelRecord(req, res) {
  if (!ensureValidParcelId(req, res)) {
    return;
  }

  const result = await getParcelById({
    requester: req.user,
    parcelId: req.params.parcelId,
    includeDeleted: String(req.query.include_deleted).toLowerCase() === "true"
  });

  if (result.error) {
    const response = parcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function updateParcelRecord(req, res) {
  if (!ensureValidParcelId(req, res)) {
    return;
  }

  const result = await updateParcel({
    requester: req.user,
    parcelId: req.params.parcelId,
    updates: req.body
  });

  if (result.error) {
    const response = parcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function updateParcelRecordStatus(req, res) {
  if (!ensureValidParcelId(req, res)) {
    return;
  }

  const result = await updateParcelStatus({
    requester: req.user,
    parcelId: req.params.parcelId,
    status: req.body.status
  });

  if (result.error) {
    const response = parcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function deleteParcelRecord(req, res) {
  if (!ensureValidParcelId(req, res)) {
    return;
  }

  const result = await softDeleteParcel({
    requester: req.user,
    parcelId: req.params.parcelId
  });

  if (result.error) {
    const response = parcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function exportParcelRecords(req, res) {
  const result = await exportParcels({
    requester: req.user,
    filters: req.query
  });

  if (result.error) {
    const response = parcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export function getStatusOptions(req, res) {
  return res.json(getParcelStatusOptions());
}
