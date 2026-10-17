import assert from 'node:assert/strict';
import test from 'node:test';
import { candidatePriority, candidateReviewReasons, FULL_REGION, hasMorePhotoWork, ocrEvidence, rankPhotoCandidates, safeRegion, strongReviewFirst } from '../src/utils/photoAnalysisPolicy.js';
import { visualSimilarity } from '../src/utils/visualSimilarity.js';
import { PhotoCandidateCursor } from '../src/utils/photoCandidateCursor.js';
import { photoSearchProgress } from '../src/utils/photoSearchProgress.js';
import { photoMatchSummary } from '../src/utils/photoMatchSummary.js';

test('photo progress shows batch remaining, not an unknown full-search total', () => {
  assert.deepEqual(photoSearchProgress({ phase: 'RUNNING', stage: 'DISCOVERING', pending: 8 }), { label: 'Finding photos...', remaining: '' });
  assert.deepEqual(photoSearchProgress({ phase: 'RUNNING', stage: 'COMPARING', pending: 8 }), { label: 'Comparing photos...', remaining: '8 photos left in this group' });
  assert.equal(photoSearchProgress({ phase: 'RUNNING', stage: 'COMPARING', pending: 1 }).remaining, '1 photo left in this group');
  assert.equal(photoSearchProgress({ phase: 'RUNNING', stage: 'COMPARING', pending: 0 }).remaining, '');
});
test('photo progress preserves paused, finished and limited states without technical counters', () => {
  assert.deepEqual(photoSearchProgress({ phase: 'PAUSED', pending: 3 }), { label: 'Search paused', remaining: '3 photos left in this group' });
  assert.equal(photoSearchProgress({ phase: 'CANCELLING', pending: 2 }).label, 'Stopping search...');
  assert.equal(photoSearchProgress({ phase: 'READY', done: false, pending: 0 }), null);
  assert.equal(photoSearchProgress({ phase: 'READY', done: true, pending: 0 }), null);
  assert.equal(photoSearchProgress({ phase: 'READY', done: false, limited: true, pending: 0 }), null);
  assert.equal(photoSearchProgress({ phase: 'IDLE' }), null);
  assert.equal(photoSearchProgress({ phase: 'ERROR' }), null);
});
test('photo leads do not claim a handover or current location from a similar image', () => {
  const result = { evidence: { photo_source: 'REGISTRATION' }, unit_reference: 'B-07-02' };
  assert.match(photoMatchSummary(result).description, /does not tell us who collected it or where it is now/);
  result.evidence.photo_source = 'COLLECTION'; result.verification_status = 'CANCELLED';
  assert.match(photoMatchSummary(result).description, /not confirmed/);
  result.verification_status = 'COMPLETED';
  assert.equal(photoMatchSummary(result).title, 'Collection photo recorded for B-07-02');
  result.colour = { status: 'SIMILAR', distance: 0 }; result.orb = { status: 'RELIABLE', matches: 30, inliers: 30, geometryAvailable: true };
  assert.equal(photoMatchSummary(result).title, 'Possible photo match for B-07-02');
  assert.match(photoMatchSummary(result).description, /before deciding/);
  result.failed = true; assert.equal(photoMatchSummary(result).title, 'Photo could not be compared');
});

test('OCR exposes only target-related snippets and never silently equates ambiguous characters', () => {
  assert.deepEqual(ocrEvidence('NAME MAYA LEE ADDRESS 12 STREET\nSPX12345678\nPHONE 0123456789', 'SPX12345678', 92), { status: 'EXACT', snippets: ['SPX12345678'] });
  assert.equal(ocrEvidence('SPX12345S78', 'SPX12345578', 92).status, 'POSSIBLE');
  assert.equal(ocrEvidence('SPX12345678', 'SPX12345678', 25).status, 'POSSIBLE');
  assert.equal(ocrEvidence('SPX 12345678', 'spx12345678', 90).status, 'EXACT');
  assert.equal(ocrEvidence('SPX12345678', 'SPX-12345678', 90).status, 'NONE');
  assert.equal(ocrEvidence('', 'SPX12345678', 0).status, 'INCONCLUSIVE');
  assert.deepEqual(ocrEvidence('0123456789 RANDOM ADDRESS', 'SPX12345678', 92).snippets, []);
});
test('priority is transparent review order, not probability or a collection outcome', () => {
  const base = { evidence: { evidence_id: 'a' }, ocr: { status: 'NONE' }, colour: { status: 'SIMILAR' }, shape: { status: 'CONSISTENT' }, orb: { status: 'INSUFFICIENT' } };
  assert.equal(candidatePriority(base), 'POTENTIAL');
  assert.equal(candidatePriority({ ...base, recordedBarcode: true, verification_status: 'CANCELLED' }), 'STRONG');
  assert.equal(candidatePriority({ ...base, failed: true, colour: { status: 'UNAVAILABLE' }, shape: { status: 'UNAVAILABLE' } }), 'UNAVAILABLE');
  assert.equal(candidatePriority({ ...base, recordedBarcode: true, failed: true }), 'UNAVAILABLE');
  assert.equal(candidatePriority({ ...base, colour: { status: 'DIFFERENT' }, shape: { status: 'DIFFERENT' } }), 'LIMITED');
  const ordered = rankPhotoCandidates([base, { ...base, evidence: { evidence_id: 'b' }, ocr: { status: 'EXACT' } }, { ...base, evidence: { evidence_id: 'c' }, recordedBarcode: true }]);
  assert.deepEqual(ordered.map((item) => item.evidence.evidence_id), ['c', 'b', 'a']);
});
test('the discovery cap does not prevent finishing already queued photos after cancellation', () => {
  assert.equal(hasMorePhotoWork({ discovered: 500, done: false, pending: ['queued'] }), true);
  assert.equal(hasMorePhotoWork({ discovered: 500, done: false, pending: [] }), false);
  assert.equal(hasMorePhotoWork({ discovered: 12, done: true, pending: [] }), false);
});
test('crop bounds preserve a valid temporary region', () => {
  assert.deepEqual(safeRegion(), FULL_REGION);
  const cropped = safeRegion({ x: .9, y: -.5, width: 5, height: -2 });
  assert.ok(cropped.x + cropped.width <= 1); assert.equal(cropped.y, 0); assert.ok(cropped.height >= .05);
});
test('cursor paginates metadata, deduplicates evidence, skips missing files, preserves pending work', async () => {
  const calls = [], signal = new AbortController().signal;
  const read = async (path, query) => {
    calls.push({ path, query });
    if (path.endsWith('/evidence')) return { evidence: query.page === 1 ? [{ evidence_id: 'two', photo_present: true }] : [{ evidence_id: 'missing', photo_present: false }], pagination: { total_pages: 2 } };
    return { collections: query.page === 1 ? [{ collection_id: 'c1', evidence_count: 1, evidence: [{ evidence_id: 'one', photo_present: true }] }, { collection_id: 'c2', evidence_count: 4, evidence: [] }] : [{ collection_id: 'c3', evidence_count: 0, evidence: [] }], pagination: { total: 3, total_pages: 2 } };
  };
  const cursor = new PhotoCandidateCursor(read, 'parcel', { from: '2026-10-01', to: '2026-10-13' });
  await cursor.fillBatch(1, signal); assert.equal(cursor.pending[0].evidence.evidence_id, 'one');
  cursor.pending.shift(); await cursor.fillBatch(2, signal);
  assert.equal(cursor.pending.length, 1); assert.equal(cursor.discovered, 2); assert.equal(cursor.skipped, 1); assert.equal(cursor.noEvidence, 1); assert.equal(cursor.done, true);
  assert.ok(calls.every((call) => call.query.limit === 20)); assert.ok(calls.some((call) => call.path.endsWith('/evidence') && call.query.page === 2));
});
test('photo discovery includes paginated registration uploads after collection photos and keeps source IDs separate', async () => {
  const calls = [], signal = new AbortController().signal;
  const registration = (id) => ({ photo_source: 'REGISTRATION', evidence: { evidence_id: id, parcel_id: id, photo_present: true, photo_source: 'REGISTRATION' } });
  const read = async (path, query) => {
    calls.push(path);
    if (path.endsWith('/registration-photos')) return { photos: query.page === 1 ? [registration('same'), registration('same')] : [registration('second')], pagination: { total: 2, total_pages: 2 } };
    return { collections: [{ collection_id: 'c', evidence_count: 1, evidence: [{ evidence_id: 'same', photo_present: true }] }], pagination: { total: 1, total_pages: 1 } };
  };
  const cursor = new PhotoCandidateCursor(read, 'target', { photo_source: 'ALL' });
  await cursor.fillBatch(3, signal);
  assert.deepEqual(cursor.pending.map((item) => item.evidence.photo_source), ['COLLECTION','REGISTRATION','REGISTRATION']);
  assert.equal(cursor.discovered,3); assert.equal(cursor.recordsTotal,3);
  cursor.pending.length = 0; await cursor.fillBatch(1,signal); assert.equal(cursor.done,true);
  assert.equal(calls.filter((path) => path.endsWith('/registration-photos')).length,2);
});
test('registration-only source never requires collection or barcode evidence', async () => {
  const cursor = new PhotoCandidateCursor(async (path) => {
    assert.ok(path.endsWith('/registration-photos'));
    return { photos: [{ photo_source:'REGISTRATION', evidence:{ evidence_id:'r', photo_present:true } }], pagination:{ total:1,total_pages:1 } };
  }, 'target', { photo_source:'REGISTRATION' });
  await cursor.fillBatch(10,new AbortController().signal);
  assert.equal(cursor.done,true); assert.equal(cursor.pending.length,1); assert.equal(cursor.noEvidence,0);
});
const weakVisual = () => ({ evidence: { evidence_id:'weak' }, colour:{ status:'DIFFERENT',distance:.71 }, shape:{ status:'INSUFFICIENT' },
  orb:{ status:'INSUFFICIENT',matches:5,inliers:4,geometryAvailable:true }, ocr:{ status:'NONE' } });
test('21% partial visual similarity is not strong merely because its collection has a matching scan', () => {
  const item = { ...weakVisual(), matching_attempt:true, recordedBarcode:false };
  assert.equal(visualSimilarity(item).score,21); assert.equal(candidatePriority(item),'LIMITED'); assert.deepEqual(candidateReviewReasons(item),[]);
});
test('a real per-photo tracking link stays separate from low visual similarity', () => {
  const item = { ...weakVisual(),recordedBarcode:true };
  assert.equal(candidatePriority(item),'STRONG'); assert.equal(visualSimilarity(item).score,21);
  assert.deepEqual(candidateReviewReasons(item),["Matching tracking number recorded for this photo's parcel"]);
});
test('reliable ORB status alone does not promote a low combined score', () => {
  const item = weakVisual(); item.orb = { status:'RELIABLE',matches:16,inliers:8,geometryAvailable:true };
  assert.ok(visualSimilarity(item).score < 50); assert.equal(candidatePriority(item),'LIMITED');
});
test('strong visual labels require both high combined similarity and reliable features', () => {
  const item = { ...weakVisual(), colour:{status:'SIMILAR',distance:0}, shape:{status:'CONSISTENT',difference:0,referenceAspectRatio:1,candidateAspectRatio:1}, orb:{status:'RELIABLE',matches:30,inliers:30,geometryAvailable:true} };
  assert.equal(candidatePriority(item),'STRONG'); assert.deepEqual(candidateReviewReasons(item),['Several small photo details look alike']);
  item.orb.status = 'INSUFFICIENT'; assert.equal(candidatePriority(item),'POTENTIAL');
});
test('strong groups remain first across sort modes and pagination, without putting failed images first', () => {
  const weak = weakVisual(), strong = { ...weak, evidence:{evidence_id:'strong'},ocr:{status:'EXACT'} }, failed={ ...weak, evidence:{evidence_id:'failed'},recordedBarcode:true,failed:true };
  assert.deepEqual(rankPhotoCandidates([failed,weak,strong]).map((item) => item.evidence.evidence_id),['strong','weak','failed']);
  const items = [...Array.from({length:12}, (_,i) => ({...weak,evidence:{evidence_id:'w'+i}})), ...Array.from({length:12}, (_,i) => ({...strong,evidence:{evidence_id:'s'+i}}))];
  const grouped=strongReviewFirst(items); assert.ok(grouped.slice(0,12).every((item)=>candidatePriority(item)==='STRONG'));
  assert.equal(grouped.slice(10,20).filter((item)=>candidatePriority(item)==='STRONG').length,2);
});
