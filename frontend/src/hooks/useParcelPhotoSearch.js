import { useEffect, useRef, useState } from 'react';
import { getParcelTrace, getParcelTracePhoto } from '../services/api.js';
import { PhotoCandidateCursor } from '../utils/photoCandidateCursor.js';
import { hasMorePhotoWork } from '../utils/photoAnalysisPolicy.js';

const empty = { phase: 'IDLE', stage: '', results: [], error: '', progress: '', records: null, visited: 0, discovered: 0, analyzed: 0, failed: 0, skipped: 0, withoutEvidence: 0, pending: 0, done: false, limited: false };
export function useParcelPhotoSearch({ parcelId, tracking, role }) {
  const [state, setState] = useState(empty), current = useRef(null), mounted = useRef(true);
  const publish = (run, patch = {}) => {
    if (!mounted.current || current.current !== run) return;
    setState((previous) => ({ ...previous, ...patch, results: [...run.results], records: run.cursor.recordsTotal,
      visited: run.cursor.recordsVisited, discovered: run.cursor.discovered,
      analyzed: run.results.filter((result) => !result.failed).length, failed: run.results.filter((result) => result.failed).length,
      skipped: run.cursor.skipped, withoutEvidence: run.cursor.noEvidence, pending: run.cursor.pending.length,
      done: run.cursor.done, limited: run.cursor.discovered >= 500 && !run.cursor.done }));
  };
  function cancel() { const run = current.current; if (run) { run.controller?.abort(); run.engine?.dispose(); publish(run, { phase: 'CANCELLING', progress: 'Stopping current analysis...' }); } }
  function reset() { const run = current.current; current.current = null; run?.controller?.abort(); run?.engine?.dispose(); if (mounted.current) setState(empty); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current?.controller?.abort(); current.current?.engine?.dispose(); current.current = null; }; }, [parcelId]);

  async function batch(run) {
    if (run.active || !['ADMIN', 'GUARD'].includes(role)) return;
    run.active = true; run.controller = new AbortController(); const signal = run.controller.signal;
    publish(run, { phase: 'RUNNING', stage: 'DISCOVERING', error: '', progress: 'Retrieving candidate metadata...' });
    try {
      await run.cursor.fillBatch(run.batchSize, signal);
      publish(run);
      if (!run.cursor.pending.length) { publish(run, { phase: 'READY', progress: run.cursor.done ? 'All discovered candidate photos checked.' : 'Photo discovery limit reached. Narrow the date range.' }); return; }
      publish(run, { stage: 'COMPARING', progress: 'Preparing reference photo and local analysis workers...' });
      const { PhotoAnalysisEngine } = await import('../services/photoAnalysis.client.js');
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      run.engine = new PhotoAnalysisEngine(signal);
      await run.engine.prepare(run.referencePhoto.blob, tracking, run.options);
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      let processed = 0;
      while (run.cursor.pending.length && processed < run.batchSize && !signal.aborted) {
        const candidate = run.cursor.pending[0];
        publish(run, { progress: `Checking photo ${run.results.length + 1}: unit ${candidate.unit_reference || 'not recorded'}` });
        let result;
        try {
          const image = await getParcelTracePhoto(parcelId, candidate.evidence.evidence_id, run.filters, { signal, photoSource: candidate.evidence.photo_source });
          const comparison = await run.engine.compare(image.blob, tracking, run.options);
          const unavailable = [comparison.ocr, comparison.colour, comparison.shape, comparison.orb].every((method) => method.status === 'UNAVAILABLE');
          result = { ...candidate, ...comparison, recordedBarcode: candidate.evidence.matching_tracking_attempt === true, failed: unavailable,
            failure: unavailable ? 'This photo could not be compared.' : '', analysisFilters: run.filters, referenceOptions: run.options, candidateOptions: run.options,
            referencePhoto: run.referencePhoto.source === 'UPLOAD' ? run.referencePhoto : null };
        } catch (error) {
          if (signal.aborted || [401, 403, 429].includes(error.status)) throw error;
          result = { ...candidate, recordedBarcode: candidate.evidence.matching_tracking_attempt === true, failed: true, failure: error.status === 404 ? 'This photo is no longer available.' : 'This photo could not be opened.',
            ocr: { status: 'UNAVAILABLE', snippets: [] }, colour: { status: 'UNAVAILABLE' }, shape: { status: 'UNAVAILABLE' }, orb: { status: 'UNAVAILABLE' }, analysisFilters: run.filters, referenceOptions: run.options, candidateOptions: run.options,
            referencePhoto: run.referencePhoto.source === 'UPLOAD' ? run.referencePhoto : null };
        }
        if (signal.aborted) break;
        run.results.push(result); run.cursor.pending.shift(); processed++; publish(run);
      }
      if (!signal.aborted) publish(run, { phase: 'READY', progress: run.cursor.done && !run.cursor.pending.length ? 'All discovered candidate photos checked.' : 'Batch complete. Further candidates remain.' });
    } catch (error) {
      if ([401, 403].includes(error.status)) { reset(); if (mounted.current) setState({ ...empty, phase: 'ERROR', error: 'You no longer have access to these photos. Sign in as an Admin or Guard.' }); }
      else if (!signal.aborted) publish(run, { phase: 'PAUSED', progress: 'Search paused before checking remaining photos.', error: error.status === 429 ? 'Too many requests. Wait a moment, then continue the search.' : 'The photo search could not finish. Continue to try again, or choose a shorter date range.' });
    } finally { run.engine?.dispose(); run.engine = null; run.active = false; publish(run, signal.aborted ? { phase: 'PAUSED', progress: 'Search cancelled. Completed results retained.' } : {}); }
  }
  async function start(filters, batchSize, options, referencePhoto) {
    if (current.current?.active || !['ADMIN', 'GUARD'].includes(role) || !referencePhoto?.blob) return;
    reset();
    const run = { cursor: new PhotoCandidateCursor(getParcelTrace, parcelId, filters), filters: { ...filters }, batchSize: Math.max(1, Math.min(20, batchSize)), options: structuredClone(options), referencePhoto, results: [], active: false };
    current.current = run; await batch(run);
  }
  async function continueSearch() { if (current.current) await batch(current.current); }
  return { ...state, start, cancel, reset, continueSearch,
    replaceResult: (result) => { const run = current.current; if (run) { run.results = run.results.map((item) => item.evidence.evidence_id === result.evidence.evidence_id ? result : item); publish(run); } },
    canContinue: Boolean(current.current && !current.current.active && hasMorePhotoWork(current.current.cursor)) };
}
