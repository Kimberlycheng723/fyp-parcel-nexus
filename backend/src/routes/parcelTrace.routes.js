import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import * as controller from '../controllers/parcelTrace.controller.js';

const router = Router();
const windows = new Map();
router.use(requireAuth, requireRole('ADMIN', 'GUARD'));
router.use((req, res, next) => {
  const now = Date.now();
  for (const [key, value] of windows) if (now - value.start >= 60000) windows.delete(key);
  if (!windows.has(req.user.user_id)) {
    if (windows.size >= 2000) return res.status(503).json({ message: 'Parcel Trace is busy. Try again shortly.' });
    windows.set(req.user.user_id, { start: now, count: 0 });
  }
  const window = windows.get(req.user.user_id);
  if (++window.count > 120) return res.set('Retry-After', '60').status(429).json({ message: 'Too many investigation requests. Please wait a minute.' });
  next();
});
router.get('/parcels', controller.search);
router.get('/parcels/:parcelId', controller.overview);
router.get('/parcels/:parcelId/barcodes', controller.barcodes);
router.get('/parcels/:parcelId/collections', controller.collections);
router.get('/parcels/:parcelId/collections/:collectionId/evidence', controller.collectionEvidence);
router.get('/parcels/:parcelId/registration-photos', controller.registrationPhotos);
router.get('/parcels/:parcelId/registration-photos/:candidateId/photo', controller.registrationCandidatePhoto);
router.get('/parcels/:parcelId/timeline', controller.timeline);
router.get('/parcels/:parcelId/registration-photo', controller.photo);
router.get('/parcels/:parcelId/evidence/:evidenceId/photo', controller.photo);
router.post('/investigations', controller.start);
router.get('/investigations/:investigationId/notes', controller.notes);
router.post('/investigations/:investigationId/notes', controller.addNote);
router.patch('/investigations/:investigationId/status', controller.transition);
export default router;
