import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";

import authRoutes from "./routes/auth.routes.js";
import courierRoutes from "./routes/courier.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import healthRoutes from "./routes/health.routes.js";
import parcelRoutes from "./routes/parcel.routes.js";
import parcelRegistrationRoutes from "./routes/parcelRegistration.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import unitRoutes from "./routes/unit.routes.js";
import userRoutes from "./routes/user.routes.js";

const app = express();
const uploadsDirectory = path.resolve("uploads");

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDirectory));

app.use("/api/auth", authRoutes);
app.use("/api/couriers", courierRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/parcels", parcelRoutes);
app.use("/api/parcel-registration", parcelRegistrationRoutes);
app.use("/api/profile", profileRoutes);
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
