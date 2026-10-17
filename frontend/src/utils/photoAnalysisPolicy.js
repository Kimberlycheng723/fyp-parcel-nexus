import { visualSimilarity } from './visualSimilarity.js';

export const FULL_REGION = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });
export const OCR_LABELS = Object.freeze({ EXACT: 'Same tracking number found in the photo', POSSIBLE: 'Similar tracking text found; check the label', NONE: 'No matching tracking number found', INCONCLUSIVE: 'Tracking text is not clear enough to read', UNAVAILABLE: 'Could not read text in this photo' });
export const PRIORITY_LABELS = Object.freeze({ STRONG: 'Strong clues to review', POTENTIAL: 'Possible match', INCONCLUSIVE: 'Not enough information', LIMITED: 'Photos look different', UNAVAILABLE: 'Photo could not be checked' });
export function normalizeOcrTracking(value) { return String(value || '').toUpperCase().replace(/\s/g, ''); }
export function ocrEvidence(text, target, confidence = 0) {
  const expected = normalizeOcrTracking(target);
  if (expected.length < 6 || expected.length > 120) return { status: 'INCONCLUSIVE', snippets: [] };
  const words = String(text || '').toUpperCase().match(/[A-Z0-9][A-Z0-9-]*/g) || [];
  let exact = '', possible = '';
  const ambiguous = (a, b) => a === b || ['0O', '1I', '5S'].some((pair) => pair.includes(a) && pair.includes(b));
  for (let index = 0; index < words.length; index++) {
    for (let length = 1; length <= 3; length++) {
      const token = words.slice(index, index + length).join('');
      if (token === expected) exact = token;
      else if (token.length === expected.length && [...token].every((char, position) => ambiguous(char, expected[position]))) possible = token;
    }
  }
  if (exact) return { status: confidence >= 60 ? 'EXACT' : 'POSSIBLE', snippets: [exact] };
  if (possible) return { status: 'POSSIBLE', snippets: [possible] };
  return { status: !words.length || confidence < 35 ? 'INCONCLUSIVE' : 'NONE', snippets: [] };
}
export function candidateReviewReasons(result) {
  if (result.failed) return [];
  const reasons = [];
  if (result.recordedBarcode === true) reasons.push('Matching tracking number recorded for this photo\'s parcel');
  if (result.ocr?.status === 'EXACT') reasons.push('The photo shows the same tracking number');
  if (result.orb?.status === 'RELIABLE' && (visualSimilarity(result).score ?? -1) >= 75) reasons.push('Several small photo details look alike');
  return reasons;
}
export function candidatePriority(result) {
  if (result.failed) return 'UNAVAILABLE';
  if (candidateReviewReasons(result).length) return 'STRONG';
  const score = visualSimilarity(result).score;
  if (score !== null && score < 50) return 'LIMITED';
  if (result.ocr?.status === 'POSSIBLE' || (result.colour?.status === 'SIMILAR' && result.shape?.status === 'CONSISTENT')) return 'POTENTIAL';
  if ([result.ocr?.status, result.colour?.status, result.shape?.status, result.orb?.status].every((status) => status === 'UNAVAILABLE')) return 'UNAVAILABLE';
  if (result.colour?.status === 'DIFFERENT' && result.shape?.status === 'DIFFERENT') return 'LIMITED';
  return 'INCONCLUSIVE';
}
export function hasMorePhotoWork(cursor) {
  return Boolean(cursor && (cursor.pending.length > 0 || !cursor.done && cursor.discovered < 500));
}
export function rankPhotoCandidates(results) {
  const priority = { STRONG: 0, POTENTIAL: 1, INCONCLUSIVE: 2, LIMITED: 3, UNAVAILABLE: 4 };
  return [...results].sort((a, b) =>
    priority[candidatePriority(a)] - priority[candidatePriority(b)]
    || Number(b.recordedBarcode === true) - Number(a.recordedBarcode === true)
    || Number(b.ocr?.status === 'EXACT') - Number(a.ocr?.status === 'EXACT')
    || Number(b.orb?.status === 'RELIABLE') - Number(a.orb?.status === 'RELIABLE')
    || (visualSimilarity(b).score ?? -1) - (visualSimilarity(a).score ?? -1)
    || a.evidence.evidence_id.localeCompare(b.evidence.evidence_id));
}
export function strongReviewFirst(results) {
  return [...results].sort((a, b) => Number(candidatePriority(b) === 'STRONG') - Number(candidatePriority(a) === 'STRONG'));
}
export function safeRegion(region = FULL_REGION) {
  const x = Math.max(0, Math.min(.95, Number(region.x) || 0)), y = Math.max(0, Math.min(.95, Number(region.y) || 0));
  return { x, y, width: Math.max(.05, Math.min(1 - x, Number(region.width) || 1)), height: Math.max(.05, Math.min(1 - y, Number(region.height) || 1)) };
}

