import { Router } from 'express';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const root = path.resolve('uploads/parcels');
router.use((req, res, next) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  next();
});
router.use(requireAuth, requireRole('ADMIN', 'GUARD', 'RESIDENT'));
router.get('/:filename', asyncHandler(async (req, res) => {
  const filename = req.params.filename;
  if (!/^\d+-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(filename)) return res.status(404).json({ message: 'Parcel photo unavailable.' });
  if (req.user.role === 'RESIDENT') {
    const allowed = await pool.query(`SELECT 1 FROM parcels WHERE unit_id=$1 AND deleted_at IS NULL
      AND parcel_photo_url=$2 LIMIT 1`, [req.user.unit_id, `/uploads/parcels/${filename}`]);
    if (!allowed.rowCount) return res.status(404).json({ message: 'Parcel photo unavailable.' });
  }
  // Staff also need authenticated access to their uploaded, not-yet-registered previews.
  const extension = path.extname(filename).toLowerCase();
  res.type(extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg');
  return res.sendFile(filename, { root, cacheControl: false, dotfiles: 'deny' }, (error) => {
    if (!error) return;
    if (!res.headersSent) res.status(error.status === 404 ? 404 : 500).json({ message: 'Parcel photo unavailable.' });
    else res.destroy();
  });
}));
export default router;
