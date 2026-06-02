import {
  changeOwnPassword,
  getProfileByUserId,
  updateProfile
} from "../services/profile.service.js";

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function updateProfileErrorResponse(result) {
  if (result.error === "EMAIL_REQUIRED") {
    return {
      status: 400,
      body: { message: "Email is required." }
    };
  }

  if (result.error === "INVALID_EMAIL") {
    return {
      status: 400,
      body: { message: "Email format is invalid." }
    };
  }

  if (result.error === "PHONE_REQUIRED") {
    return {
      status: 400,
      body: { message: "Phone number is required." }
    };
  }

  if (result.error === "NAME_REQUIRED") {
    return {
      status: 400,
      body: { message: "First name and last name are required for this role." }
    };
  }

  if (result.error === "EMAIL_ALREADY_EXISTS") {
    return {
      status: 409,
      body: { message: "Email is already used by another account." }
    };
  }

  return {
    status: 404,
    body: { message: "Profile was not found." }
  };
}

function changePasswordErrorResponse(result) {
  if (result.error === "WEAK_PASSWORD") {
    return {
      status: 400,
      body: {
        message: "Password does not meet strength requirements.",
        errors: result.passwordErrors
      }
    };
  }

  if (result.error === "INVALID_CURRENT_PASSWORD") {
    return {
      status: 400,
      body: { message: "Current password is incorrect." }
    };
  }

  return {
    status: 404,
    body: { message: "Profile was not found." }
  };
}

export async function getProfile(req, res) {
  const profile = await getProfileByUserId(req.user.user_id);

  if (!profile) {
    return res.status(404).json({
      message: "Profile was not found."
    });
  }

  return res.json({
    profile
  });
}

export async function updateOwnProfile(req, res) {
  const result = await updateProfile({
    userId: req.user.user_id,
    updates: req.body
  });

  if (result.error) {
    const response = updateProfileErrorResponse(result);
    return res.status(response.status).json(response.body);
  }

  return res.json({
    profile: result.profile
  });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (isBlank(currentPassword) || isBlank(newPassword)) {
    return res.status(400).json({
      message: "Current password and new password are required."
    });
  }

  const result = await changeOwnPassword({
    userId: req.user.user_id,
    currentPassword,
    newPassword
  });

  if (result.error) {
    const response = changePasswordErrorResponse(result);
    return res.status(response.status).json(response.body);
  }

  return res.json({
    message: "Password changed successfully. Please use the new password for your next login."
  });
}
