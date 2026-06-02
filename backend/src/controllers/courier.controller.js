import { createCourier, listActiveCouriers } from "../services/courier.service.js";

function courierErrorResponse(error) {
  const responses = {
    COURIER_NAME_REQUIRED: [400, "Courier name is required."],
    COURIER_ALREADY_EXISTS: [409, "Courier company already exists."],
    FORBIDDEN: [403, "You do not have permission to create courier companies."]
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
