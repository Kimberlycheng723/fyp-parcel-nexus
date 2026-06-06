import { createCourier, listActiveCouriers, updateCourier } from "../services/courier.service.js";

function courierErrorResponse(error) {
  const responses = {
    COURIER_NAME_REQUIRED: [400, "Courier name is required."],
    COURIER_CODE_REQUIRED: [400, "Courier code is required."],
    INVALID_BADGE_COLOR: [400, "Courier badge colour must be selected from the allowed colours."],
    COURIER_ALREADY_EXISTS: [409, "Courier company already exists."],
    COURIER_NOT_FOUND: [404, "Courier company was not found."],
    FORBIDDEN: [403, "You do not have permission to manage courier companies."]
  };

  const [status, message] = responses[error] || [500, "Unable to complete courier request."];
  return { status, body: { message } };
}

export async function listCouriers(req, res) {
  const result = await listActiveCouriers();
  return res.json(result);
}

export async function createCourierCompany(req, res) {
  const result = await createCourier({
    requester: req.user,
    input: req.body
  });

  if (result.error) {
    const response = courierErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.status(201).json(result);
}

export async function updateCourierCompany(req, res) {
  const result = await updateCourier({
    requester: req.user,
    courierId: req.params.courierId,
    input: req.body
  });

  if (result.error) {
    const response = courierErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}
