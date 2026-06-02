import { activateAccount } from "../services/activation.service.js";
import { getSafeUserById, loginWithEmailAndPassword } from "../services/auth.service.js";
import { createPasswordResetToken, resetPassword } from "../services/passwordReset.service.js";

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function loginErrorResponse(error) {
  if (error === "PENDING_ACTIVATION") {
    return {
      status: 403,
      body: {
        message: "Account is pending activation."
      }
    };
  }

  if (error === "DEACTIVATED") {
    return {
      status: 403,
      body: {
        message: "Account has been deactivated."
      }
    };
  }

  return {
    status: 401,
    body: {
      message: "Invalid email or password."
    }
  };
}

function activationErrorResponse(result) {
  if (result.error === "WEAK_PASSWORD") {
    return {
      status: 400,
      body: {
        message: "Password does not meet strength requirements.",
        errors: result.passwordErrors
      }
    };
  }

  if (result.error === "TOKEN_USED") {
    return {
      status: 400,
      body: {
        message: "Activation token has already been used."
      }
    };
  }

  if (result.error === "TOKEN_EXPIRED") {
    return {
      status: 400,
      body: {
        message: "Activation token has expired."
      }
    };
  }

  if (result.error === "USER_DEACTIVATED") {
    return {
      status: 403,
      body: {
        message: "Account has been deactivated."
      }
    };
  }

  return {
    status: 400,
    body: {
      message: "Activation token is invalid."
    }
  };
}

function passwordResetErrorResponse(result) {
  if (result.error === "WEAK_PASSWORD") {
    return {
      status: 400,
      body: {
        message: "Password does not meet strength requirements.",
        errors: result.passwordErrors
      }
    };
  }

  if (result.error === "TOKEN_USED") {
    return {
      status: 400,
      body: {
        message: "Password reset token has already been used."
      }
    };
  }

  if (result.error === "TOKEN_EXPIRED") {
    return {
      status: 400,
      body: {
        message: "Password reset token has expired."
      }
    };
  }

  if (result.error === "USER_DEACTIVATED") {
    return {
      status: 403,
      body: {
        message: "Account has been deactivated."
      }
    };
  }

  return {
    status: 400,
    body: {
      message: "Password reset token is invalid."
    }
  };
}

export async function login(req, res) {
  const { email, password } = req.body;

  if (isBlank(email) || isBlank(password)) {
    return res.status(400).json({
      message: "Email and password are required."
    });
  }

  const result = await loginWithEmailAndPassword({ email, password });

  if (result.error) {
    const response = loginErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json({
    accessToken: result.accessToken,
    user: result.user
  });
}

export async function activate(req, res) {
  const { token, newPassword } = req.body;

  if (isBlank(token) || isBlank(newPassword)) {
    return res.status(400).json({
      message: "Activation token and new password are required."
    });
  }

  const result = await activateAccount({ token, newPassword });

  if (result.error) {
    const response = activationErrorResponse(result);
    return res.status(response.status).json(response.body);
  }

  return res.json({
    message: "Account activated successfully. You can now log in."
  });
}

export async function forgotPassword(req, res) {
  const { email } = req.body;

  if (isBlank(email)) {
    return res.status(400).json({
      message: "Email is required."
    });
  }

  const result = await createPasswordResetToken({ email });

  return res.json(result);
}

export async function resetPasswordWithToken(req, res) {
  const { token, newPassword } = req.body;

  if (isBlank(token) || isBlank(newPassword)) {
    return res.status(400).json({
      message: "Password reset token and new password are required."
    });
  }

  const result = await resetPassword({ token, newPassword });

  if (result.error) {
    const response = passwordResetErrorResponse(result);
    return res.status(response.status).json(response.body);
  }

  return res.json({
    message: "Password reset successfully. You can now log in with the new password."
  });
}

export async function getCurrentUser(req, res) {
  const user = await getSafeUserById(req.user.user_id);

  if (!user) {
    return res.status(404).json({
      message: "Authenticated user was not found."
    });
  }

  return res.json({
    user
  });
}

export function logout(req, res) {
  return res.json({
    message: "Logout successful. Please remove the access token on the client."
  });
}
