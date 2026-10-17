import * as trace from '../services/parcelTrace.service.js';

export function traceHandler(operation) {
  return async (req, res, next) => {
    try { return await operation(req, res, next); }
    catch (error) {
      if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
      console.error('Parcel Trace operation failed:', error.code || error.name);
      return next(error);
    }
  };
}
export const search = traceHandler(async (req, res) => res.json(await trace.searchTraceParcels(req.user, req.query)));
export const overview = traceHandler(async (req, res) => res.json(await trace.traceOverview(req.user, req.params.parcelId, req.query.dispute_id)));
export const barcodes = traceHandler(async (req, res) => res.json(await trace.traceBarcodes(req.user, req.params.parcelId, req.query)));
export const collections = traceHandler(async (req, res) => res.json(await trace.traceCollections(req.user, req.params.parcelId, req.query)));
export const collectionEvidence = traceHandler(async (req, res) => res.json(await trace.traceCollectionEvidence(req.user, req.params.parcelId, req.params.collectionId, req.query)));
export const registrationPhotos = traceHandler(async (req, res) => res.json(await trace.traceRegistrationPhotos(req.user, req.params.parcelId, req.query)));
export const timeline = traceHandler(async (req, res) => res.json(await trace.traceTimeline(req.user, req.params.parcelId, req.query)));
export const start = traceHandler(async (req, res) => {
  const result = await trace.startInvestigation(req.user, req.body);
  return res.status(result.already_exists ? 200 : 201).json(result);
});
export const notes = traceHandler(async (req, res) => res.json(await trace.investigationNotes(req.user, req.params.investigationId, req.query)));
export const addNote = traceHandler(async (req, res) => res.status(201).json(await trace.addInvestigationNote(req.user, req.params.investigationId, req.body, req.query)));
export const transition = traceHandler(async (req, res) => res.json(await trace.transitionInvestigation(req.user, req.params.investigationId, req.body)));
function photoHandler(operation) { return traceHandler(async (req, res, next) => {
  const file = await operation(req);
  res.type(file.mime).set({ 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
  return res.sendFile(file.filename, { root: file.root, dotfiles: 'deny' }, (error) => {
    if (!error || res.headersSent) return;
    if (error.code === 'ENOENT' || error.status === 404) res.status(404).json({ message: 'Photo unavailable.' });
    else next(error);
  });
}); }
export const photo = photoHandler((req) => trace.tracePhoto(req.user, req.params.parcelId, req.params.evidenceId, req.query));
export const registrationCandidatePhoto = photoHandler((req) => trace.traceRegistrationCandidatePhoto(req.user, req.params.parcelId, req.params.candidateId, req.query));
