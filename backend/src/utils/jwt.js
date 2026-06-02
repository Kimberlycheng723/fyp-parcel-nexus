import jwt from "jsonwebtoken";

const ACCESS_TOKEN_EXPIRES_IN = "1h";

function getAccessTokenSecret() {
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error("JWT_ACCESS_SECRET is not configured");
  }

  return process.env.JWT_ACCESS_SECRET;
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.user_id,
      email: user.email,
      role: user.role
    },
    getAccessTokenSecret(),
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getAccessTokenSecret());
}
