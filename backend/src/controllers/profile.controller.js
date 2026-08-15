import {
  confirmEmailChange,
  changeOwnPassword,
  getProfileByUserId,
  requestEmailChange,
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

  if (result.error === "EMAIL_VERIFICATION_SEND_FAILED") {
    return {
      status: 502,
      body: { message: "Verification email could not be sent. Please check the email address and try again." }
    };
  }

  return {
    status: 404,
    body: { message: "Profile was not found." }
  };
}

function confirmEmailChangeErrorResponse(result) {
  if (result.error === "EMAIL_ALREADY_EXISTS") {
    return {
      status: 409,
      body: { message: "Email is already used by another account." }
    };
  }

  if (result.error === "USER_DEACTIVATED") {
    return {
      status: 403,
      body: { message: "Account has been deactivated." }
    };
  }

  if (result.error === "PROFILE_NOT_FOUND") {
    return {
      status: 404,
      body: { message: "Profile was not found." }
    };
  }

  return {
    status: 400,
    body: { message: "Email verification link is invalid or expired." }
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

export async function requestOwnEmailChange(req, res) {
  const { email } = req.body;

  if (isBlank(email)) {
    return res.status(400).json({
      message: "Email is required."
    });
  }

  const result = await requestEmailChange({
    userId: req.user.user_id,
    email
  });

  if (result.error) {
    const response = updateProfileErrorResponse(result);
    return res.status(response.status).json(response.body);
  }

  return res.json({
    message: result.message,
    unchanged: result.unchanged || false
  });
}

export async function confirmOwnEmailChange(req, res) {
  const { token } = req.body;

  if (isBlank(token)) {
    return res.status(400).json({
      message: "Email verification token is required."
    });
  }

  const result = await confirmEmailChange({ token });

  if (result.error) {
    const response = confirmEmailChangeErrorResponse(result);
    return res.status(response.status).json(response.body);
  }

  return res.json({
    message: result.message
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
