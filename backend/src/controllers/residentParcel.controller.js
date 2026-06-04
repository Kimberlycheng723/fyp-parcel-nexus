import {
  getResidentParcelById,
  getResidentParcelSummary,
  listResidentParcels
} from "../services/residentParcel.service.js";

function residentParcelErrorResponse(error) {
  const responses = {
    FORBIDDEN: [403, "Only residents can access resident parcel records."],
    RESIDENT_UNIT_NOT_FOUND: [404, "Resident unit is not assigned."],
    INVALID_TAB: [400, "Tab must be pending or history."],
    INVALID_PARCEL_ID: [400, "Parcel ID format is invalid."],
    PARCEL_NOT_FOUND: [404, "Parcel record was not found."]
  };

  const [status, message] = responses[error] || [500, "Unable to complete resident parcel request."];
  return { status, body: { message } };
}

export async function getSummary(req, res) {
  const result = await getResidentParcelSummary({
    requester: req.user
  });

  if (result.error) {
    const response = residentParcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function listParcels(req, res) {
  const result = await listResidentParcels({
    requester: req.user,
    filters: req.query
  });

  if (result.error) {
    const response = residentParcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function getParcel(req, res) {
  const result = await getResidentParcelById({
    requester: req.user,
    parcelId: req.params.parcelId?.trim()
  });

  if (result.error) {
    const response = residentParcelErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}
