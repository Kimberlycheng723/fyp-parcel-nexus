import crypto from "node:crypto";

export function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function compareTokenHash(token, tokenHash) {
  const calculatedHash = hashToken(token);

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHash, "hex"),
    Buffer.from(tokenHash, "hex")
  );
}
