import { Server } from "socket.io";

import { getSafeUserById } from "../services/auth.service.js";
import { verifyAccessToken } from "../utils/jwt.js";

let socketServer = null;

function privateUserRoom(userId) {
  return `user:${userId}`;
}

function handshakeToken(socket) {
  const authToken = socket.handshake.auth?.token;

  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  const authorization = socket.handshake.headers.authorization;
  const [scheme, token] = typeof authorization === "string"
    ? authorization.split(" ")
    : [];

  return scheme === "Bearer" && token ? token : null;
}

export function initializeSocketServer(httpServer) {
  socketServer = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false
    }
  });

  socketServer.use(async (socket, next) => {
    try {
      const token = handshakeToken(socket);

      if (!token) {
        return next(new Error("Authentication failed."));
      }

      const payload = verifyAccessToken(token);
      const user = await getSafeUserById(payload.sub);

      if (!user || user.status !== "ACTIVE") {
        return next(new Error("Authentication failed."));
      }

      socket.data.user = {
        user_id: user.user_id,
        role: user.role
      };
      socket.data.auth_expires_at = payload.exp * 1000;

      return next();
    } catch (error) {
      return next(new Error("Authentication failed."));
    }
  });

  socketServer.on("connection", (socket) => {
    socket.join(privateUserRoom(socket.data.user.user_id));

    const sessionLifetime = Math.max(0, socket.data.auth_expires_at - Date.now());
    const expiryTimer = setTimeout(() => socket.disconnect(true), sessionLifetime);

    socket.once("disconnect", () => clearTimeout(expiryTimer));
  });

  return socketServer;
}

export function emitToUser(userId, eventName, payload) {
  if (!socketServer || !userId || !eventName) {
    return false;
  }

  socketServer.to(privateUserRoom(userId)).emit(eventName, payload);
  return true;
}
