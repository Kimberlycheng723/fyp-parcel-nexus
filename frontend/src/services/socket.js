import { io } from "socket.io-client";

import { getAccessToken } from "./tokenStorage.js";

let realtimeSocket = null;
let activeConsumers = 0;

function createRealtimeSocket() {
  return io({
    path: "/socket.io",
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: (callback) => {
      callback({ token: getAccessToken() });
    }
  });
}

export function acquireRealtimeSocket() {
  if (!realtimeSocket) {
    realtimeSocket = createRealtimeSocket();
  }

  activeConsumers += 1;

  if (!realtimeSocket.connected) {
    realtimeSocket.connect();
  }

  return realtimeSocket;
}

export function releaseRealtimeSocket() {
  activeConsumers = Math.max(0, activeConsumers - 1);

  if (activeConsumers === 0 && realtimeSocket) {
    realtimeSocket.disconnect();
  }
}
