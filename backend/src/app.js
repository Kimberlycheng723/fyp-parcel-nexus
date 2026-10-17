import cors from "cors";
import express from "express";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import chatbotRoutes from "./routes/chatbot.routes.js";
import courierRoutes from "./routes/courier.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import disputeRoutes from "./routes/dispute.routes.js";
import healthRoutes from "./routes/health.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import parcelRoutes from "./routes/parcel.routes.js";
import parcelPhotoRoutes from "./routes/parcelPhoto.routes.js";
import parcelTraceRoutes from "./routes/parcelTrace.routes.js";
import parcelRoomRoutes from "./routes/parcelRoom.routes.js";
import parcelCollectionRoutes from "./routes/parcelCollection.routes.js";
import parcelRegistrationRoutes from "./routes/parcelRegistration.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import residentParcelRoutes from "./routes/residentParcel.routes.js";
import unitRoutes from "./routes/unit.routes.js";
import userRoutes from "./routes/user.routes.js";

const app = express();

app.use(helmet());
app.use(cors({
  exposedHeaders: ["Content-Disposition"]
}));
// Apply the chatbot's smaller JSON limit before the shared parser consumes the body.
app.use("/api/chatbot", chatbotRoutes);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads/parcels", parcelPhotoRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/couriers", courierRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/health", healthRoutes);
app.use("/api", notificationRoutes);
app.use("/api", parcelCollectionRoutes);
app.use("/api/parcels", parcelRoutes);
app.use("/api/parcel-trace", parcelTraceRoutes);
app.use("/api/parcel-rooms", parcelRoomRoutes);
app.use("/api/parcel-registration", parcelRegistrationRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/resident", residentParcelRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/users", userRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found"
  });
});

app.use((error, req, res, next) => {
  res.status(500).json({
    message: "Internal server error"
  });
});

export default app;
