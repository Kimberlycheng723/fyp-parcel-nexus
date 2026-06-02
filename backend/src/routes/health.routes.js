import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "parcel-nexus-backend"
  });
});

export default router;
