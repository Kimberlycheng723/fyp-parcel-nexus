import { Router } from "express";

import { testDatabaseConnection } from "../db/pool.js";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "parcel-nexus-backend"
  });
});

router.get("/db", async (req, res) => {
  try {
    const result = await testDatabaseConnection();

    res.json({
      status: "ok",
      database: "connected",
      checkedAt: result.checkedAt
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      database: "unavailable"
    });
  }
});

export default router;
