import { registerParcelSession } from "../services/parcelRegistration.service.js";

function registrationErrorResponse(error) {
  const responses = {
    COURIER_REQUIRED: [400, "Courier company is required."],
    DELIVERY_CONTACT_REQUIRED: [400, "Delivery person contact number is required."],
    PARCELS_REQUIRED: [400, "At least one parcel is required."],
    UNIT_REQUIRED: [400, "Unit is required for each parcel."],
    TRACKING_NUMBER_REQUIRED: [400, "Tracking number is required for each parcel."],
    DUPLICATE_TRACKING_IN_SESSION: [409, "The same tracking number cannot be added twice in one session."],
    COURIER_NOT_FOUND: [404, "Courier company was not found or is not active."],
    UNIT_NOT_FOUND: [404, "Unit not found. Please ask Admin to create the resident/unit account first."],
    TRACKING_ALREADY_EXISTS: [409, "Tracking number already exists."],
    FORBIDDEN: [403, "You do not have permission to register parcels."]
  };

  const [status, message] = responses[error] || [500, "Unable to complete parcel registration."];
  return { status, body: { message } };
}

export async function uploadParcelPhoto(req, res) {
  if (!req.file) {
    return res.status(400).json({
      message: "Parcel photo file is required."
    });
  }

  return res.status(201).json({
    parcel_photo_url: `/uploads/parcels/${req.file.filename}`,
    original_filename: req.file.originalname,
    stored_filename: req.file.filename,
    mime_type: req.file.mimetype,
    size_bytes: req.file.size
  });
}

export async function createParcelRegistrationSession(req, res) {
  const result = await registerParcelSession({
    requester: req.user,
    input: req.body
  });

  if (result.error) {
    const response = registrationErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.status(201).json(result);
}
