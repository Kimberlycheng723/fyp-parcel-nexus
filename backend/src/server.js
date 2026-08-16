import "dotenv/config";

import { createServer } from "node:http";

import app from "./app.js";
import { initializeSocketServer } from "./realtime/socket.js";
import { startNotificationScheduler } from "./services/notificationScheduler.service.js";

const port = process.env.PORT || 5000;
const httpServer = createServer(app);

initializeSocketServer(httpServer);
startNotificationScheduler();

httpServer.listen(port, () => {
  console.log(`Parcel Nexus backend running on port ${port}`);
});
