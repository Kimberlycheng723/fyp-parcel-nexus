import { getSafeUserById, loginWithEmailAndPassword } from "../services/auth.service.js";

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
