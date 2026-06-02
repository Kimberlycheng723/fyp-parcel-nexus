import {
  createManagedUser,
  getAllowedManagedRoles,
  getManagedUserById,
  listManagedUsers,
  resendManagedActivationEmail,
  updateManagedUser,
  updateManagedUserStatus
} from "../services/user.service.js";

function validationResponse(error) {
  const responses = {
    ROLE_REQUIRED: [400, "Role is required."],
    INVALID_ROLE: [400, "Role is invalid for user management."],
    FORBIDDEN_ROLE: [403, "You do not have permission to manage this role."],
    EMAIL_REQUIRED: [400, "Email is required."],
    INVALID_EMAIL: [400, "Email format is invalid."],
    PHONE_REQUIRED: [400, "Phone number is required."],
    NAME_REQUIRED: [400, "First name and last name are required for this role."],
    ASSIGNED_POST_REQUIRED: [400, "Assigned post is required for guard accounts."],
    UNIT_REQUIRED: [400, "Unit code is required for resident accounts."],
    EMAIL_ALREADY_EXISTS: [409, "Email is already used by another account."],
    UNIT_ALREADY_HAS_RESIDENT: [409, "This unit already has a resident account."],
    UNIQUE_CONSTRAINT_FAILED: [409, "A unique account rule was violated. Please check email and unit information."],
    INVALID_STATUS: [400, "Status must be ACTIVE or DEACTIVATED."],
    CANNOT_UPDATE_SELF_STATUS: [400, "You cannot deactivate or reactivate your own account."],
    CANNOT_ACTIVATE_WITHOUT_PASSWORD: [
      400,
      "This account has not set a password yet. Resend the activation email instead."
    ],
    USER_NOT_PENDING_ACTIVATION: [400, "Activation email can only be resent for pending activation accounts."],
    FORBIDDEN: [403, "You do not have permission to access this user account."],
    USER_NOT_FOUND: [404, "User account was not found."]
  };

  const [status, message] = responses[error] || [500, "Unable to complete user management request."];
  return { status, body: { message } };
}

function ensureUserManager(req, res) {
  const allowedRoles = getAllowedManagedRoles(req.user.role);

  if (allowedRoles.length === 0) {
    res.status(403).json({
      message: "You do not have permission to access user management."
    });
    return false;
  }

  return true;
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function ensureValidUserId(req, res) {
  if (!isValidUuid(req.params.userId)) {
    res.status(400).json({
      message: "User ID format is invalid."
    });
    return false;
  }

  return true;
}

export async function createUser(req, res) {
  if (!ensureUserManager(req, res)) {
    return;
  }

  const result = await createManagedUser({
    requester: req.user,
    input: req.body
  });

  if (result.error) {
    const response = validationResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.status(201).json(result);
}

export async function listUsers(req, res) {
  if (!ensureUserManager(req, res)) {
    return;
  }

  const result = await listManagedUsers({
    requester: req.user,
    filters: req.query
  });

  if (result.error) {
    const response = validationResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function getUser(req, res) {
  if (!ensureUserManager(req, res)) {
    return;
  }

  if (!ensureValidUserId(req, res)) {
    return;
  }

  const result = await getManagedUserById({
    requester: req.user,
    userId: req.params.userId
  });

  if (result.error) {
    const response = validationResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function updateUser(req, res) {
  if (!ensureUserManager(req, res)) {
    return;
  }

  if (!ensureValidUserId(req, res)) {
    return;
  }

  const result = await updateManagedUser({
    requester: req.user,
    userId: req.params.userId,
    updates: req.body
  });

  if (result.error) {
    const response = validationResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function updateUserStatus(req, res) {
  if (!ensureUserManager(req, res)) {
    return;
  }

  if (!ensureValidUserId(req, res)) {
    return;
  }

  const result = await updateManagedUserStatus({
    requester: req.user,
    userId: req.params.userId,
    status: req.body.status
  });

  if (result.error) {
    const response = validationResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function resendActivationEmail(req, res) {
  if (!ensureUserManager(req, res)) {
    return;
  }

  if (!ensureValidUserId(req, res)) {
    return;
  }

  const result = await resendManagedActivationEmail({
    requester: req.user,
    userId: req.params.userId
  });

  if (result.error) {
    const response = validationResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}
