import { getSafeUserById } from "../services/auth.service.js";
import { verifyAccessToken } from "../utils/jwt.js";

function getBearerToken(req) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireAuth(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      message: "Authentication token is required."
    });
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await getSafeUserById(payload.sub);

    if (!user) {
      return res.status(401).json({
        message: "Authenticated user no longer exists."
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        message: "Authenticated user is not active."
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Authentication token is invalid or expired."
    });
  }
}
