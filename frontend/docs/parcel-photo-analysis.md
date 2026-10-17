# Step 18E: Parcel Photo Analysis Handoff

Step 18F subsequently protected the legacy registration-photo route and added an
owned OCR host worker for initialization-error/cancellation cleanup. Its live
integration results supersede the earlier public-photo/initialization limitations:
see [Step 18F](../../backend/docs/feature18-integration.md). Historical photo
versioning and physical-device limitations remain.

## Scope and Architecture

### Reference Photo Fallback (14 October 2026)

Photo Search now automatically retrieves and validates the authorized registration
photo as its reference. This does not start OCR/OpenCV or fetch collection photos;
analysis still requires the explicit Search action. A missing registration image
exposes **Upload Reference Photo** for Admin/Guard, including courier-delivery
photos supplied by a resident. Search and Reference Regions remain disabled
until a usable reference is available. Authorization failures do not enable an
upload bypass.

Uploaded references accept JPEG, PNG, and WebP within the existing analysis limits
(20 MB and 32 megapixels), are decoded before use, and remain browser-memory-only.
They are not registration records, historical collection evidence, or permanent
server uploads. They are used consistently by search, reference regions, analysis
details, and the existing evidence comparison. Replacing/removing a reference
clears results and crops; leaving Parcel Trace releases its object URLs and workers.
No backend, database, or environment change is required for this fallback.

Validation for this refinement: production build, 10 policy/trace unit tests,
40 Parcel Trace browser scenarios, and 40 photo-analysis browser scenarios passed.
The photo-analysis suite uses actual OCR/OpenCV workers with intercepted API/image
fixtures, including Admin/Guard uploads, invalid MIME/size/corrupt files, unavailable
and forbidden registration photos, region selection, comparisons, replacement,
removal, and object-URL/worker cleanup. No live database records were created.

Step 18E extends the existing Admin/Guard Parcel Trace workspace at
`/parcel-trace`; it is not a separate investigation page or identity model.
Photo Search starts only on explicit request. It compares the selected reference
photo with authorized cross-unit collection evidence,
using local OCR and visual methods on temporary browser copies. Barcode Trace
and manual evidence comparison remain available. The October 14 refinement
removes Investigation Notes (including Visual Review), Chain of Custody, and
Start Investigation from Parcel Trace, along with their reads and writes.
Existing backend records and Dispute Management remain unchanged. Investigation
status is displayed read-only. Analysis does not create an investigation,
save findings automatically, accuse anyone or mutate any workflow status.

The original Step 18E brief and the implemented source were inspected, together
with the [Step 18D contract](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/docs/parcel-trace.md).
That document's statements that OCR/OpenCV are future work describe the Step 18D
baseline; this handoff documents the implemented extension.

Request flow: `ParcelPhotoSearch` -> `useParcelPhotoSearch` -> paged
`PhotoCandidateCursor` metadata -> existing authenticated photo GET helpers ->
lazy `PhotoAnalysisEngine` -> Tesseract OCR worker and OpenCV module worker ->
component findings and transparent review ordering. `PhotoAnalysisPreview` and
`PhotoRegionDialog` provide explicit comparison/region controls. No new backend
endpoint, database table, migration, environment setting or paid service is
required. No Python, CLIP, Gemini or external image-analysis service is used.

## Incumbent Operate Comparison

This is an ordinary incumbent extension in Operate mode. Evidence checked:
`ParcelTracePage.jsx`, `ParcelTraceEvidence.jsx`, the four new photo components,
`parcel-trace.css`, `photo-analysis.css`, `base.css`, and existing shell/button
styles in `layout.css`, `auth.css` and `components.css`.

- The existing `ProtectedLayout`, navigation, Inter/system operational type,
  ink/muted text, soft surfaces, line borders and navy/blue accents are retained.
- Photo Search uses the incumbent unframed, border-separated `trace-section`
  layout, existing primary/secondary buttons, status vocabulary and pagination.
  Its repeated result frames match incumbent candidate frames: 18px padding,
  8px corners, white background and line borders. This is not a global token
  replacement; existing button radii remain unchanged.
- Compact 11-14px findings/labels and 16-18px local headings preserve the trace
  hierarchy. Status text carries meaning in addition to colour. Lucide controls,
  labelled inputs, native radio/checkbox/range controls and native dialogs retain
  familiar interaction patterns. Dialogs support Escape and focus restoration.
- At 1000px, filters reflow and result columns reduce to one; at 640px, comparison
  photos stack, actions wrap and crop fields reduce to two columns. Existing
  trace focus treatment is reused. Zoom overflow stays inside the photo viewport;
  the dialog has bounded height and internal vertical scrolling.

The Impeccable documentation reference was read and its evidence-first guidance
applied. Its context launcher could not run because the engine/cache was
unavailable under current permissions; existing project sources supplied the
comparison instead. No `DESIGN.md`, sidecar, surface brief, token change or drift
repair was created. This documents consistency, not a comprehensive accessibility
audit or a new visual authority.

## Dependencies and Deployment

Direct additions are exactly pinned in `frontend/package.json` and the root
lockfile: `tesseract.js` **7.0.0**, `@techstark/opencv-js`
**4.12.0-release.1**, and `@tesseract.js-data/eng` **1.0.0**. The lockfile resolves
the transitive `tesseract.js-core` to 7.0.0. Existing React/Vite/Lucide are reused;
unrelated dirty-tree dependencies are not Step 18E additions.

`frontend/scripts/imageAnalysisAssets.js` serves local assets during development
and emits them for production: Tesseract worker, English
`4.0.0_best_int/eng.traineddata.gz`, three LSTM core variants (baseline, SIMD,
relaxed SIMD), and license files. Tesseract chooses a supported core; callers
must deploy all emitted variants. The engine uses the Vite base path, same-origin
worker/core/language URLs, `workerBlobURL: false`, `cacheMethod: 'none'` and quiet
logging/error callbacks. Unrelated pages do not load analysis runtimes.

Observed raw production assets are approximately **10.8MB OpenCV worker + 3.9MB
one selected OCR core + 2.95MB English data**. Deploying all three cores makes the
analysis asset footprint approximately **25.6MB raw**, including worker/client
support files. These are decimal byte-size estimates, not compressed transfer
sizes, browser memory measurements or the entire application size. Compression,
bandwidth, static-file limits, storage and browser memory still matter. Browser
processing reduces backend computation, but does not guarantee free hosting,
unlimited processing/storage or acceptable latency on every device.

The final production build passed in **8.15s**. Existing large-chunk warnings and
OpenCV's bundled Node-branch externalization warnings remain; actual browser
runtime verification passed. The reported npm audit found **11 existing
toolchain advisories**, with no direct new analysis-dependency finding. No
automatic dependency upgrades were performed; this is not an all-clear security
claim.

## Preprocessing and OCR

`photoPreprocessing.js` accepts nonempty JPEG/PNG/WebP blobs up to 20MiB and rejects
decoded images above 32 million pixels. `createImageBitmap` requests
`imageOrientation: 'from-image'`; an image decode/Blob URL fallback is available.
Temporary canvases use a white base and preserve aspect ratio without upscaling.
Visual copies have a maximum 640px dimension. OCR uses a separate unsegmented
full-image/label crop at up to 2400px, not the low-resolution foreground copy.
Parcel and label regions are independent normalized rectangles, clamped to valid
bounds with a minimum 5% width/height. These limits do not eliminate the cost of
decoding the original image before its dimensions are checked.

OCR uses English LSTM mode (`createWorker('eng', 1)`) with sparse-text page
segmentation mode 11. One OCR worker is reused sequentially within a batch.
Reference OCR is shown separately; candidate OCR is compared against the
investigated parcel's tracking number, not used to infer responsibility.

Exact policy in `photoAnalysisPolicy.js`:

- Expected tracking text is uppercased and whitespace removed; valid target
  length is 6-120. Punctuation is not broadly stripped: a hyphenated tracking
  number is not silently equated with an unhyphenated one.
- OCR is tokenized as uppercase alphanumeric/hyphen words. Up to three adjacent
  tokens are joined to account for harmless printed spaces.
- An identical target token with overall OCR confidence **>=60** is `EXACT`;
  the same token below 60 is only `POSSIBLE`.
- Equal-length substitutions limited to **0/O, 1/I, 5/S** are `POSSIBLE`, never
  silently promoted to exact. Without a matching token, no words or confidence
  **<35** is `INCONCLUSIVE`; otherwise the result is `NONE`.
- Initialization/recognition failure or deadline is `UNAVAILABLE`, not evidence
  that text differs. UI labels distinguish Exact Tracking Number Match, Possible
  Text Match, No Matching Text Detected, OCR Inconclusive and OCR Unavailable.

Only the target-related exact/possible snippet is returned and displayed.
Unrelated names, addresses and phone numbers are discarded from findings; full
OCR text is not logged, persisted or put in local/session storage. OCR confidence
is an extraction quality signal, not a parcel-identity probability. OCR can
misread labels; manual review remains necessary.

## OpenCV Capabilities and Exact Thresholds

The pinned actual runtime exposes `calcHist`, `compareHist`, `findContours`,
`matchShapes`, `grabCut`, `ORB`, `BFMatcher` and `findHomography`. Real deterministic
OpenCV tests execute histogram, contour, ORB and GrabCut paths; actual Chrome
worker verification also executes OCR/histogram/shape/ORB. Runtime capability
checks remain in place rather than assuming every future build supports them.

| Method | Implemented rule |
| --- | --- |
| Colour | RGBA -> RGB -> HSV; 18 x 8 x 8 H/S/V bins over `[0,180)`, `[0,256)`, `[0,256)`, L1 normalization. Bhattacharyya distance **<=0.25** is `SIMILAR`, **>0.25 and <=0.5** is `MODERATE`, **>0.5** is `DIFFERENT`; nonfinite distance is `INCONCLUSIVE`. Uses a valid foreground mask when available. |
| Shape extraction | Foreground mask when isolated; otherwise grayscale, 5x5 Gaussian blur and Canny **40/120**. External contours with simple chain approximation; largest contour accepted at **>=4% and <99%** of image area. Missing/unsuitable outlines are `INSUFFICIENT`. |
| Shape comparison | `CONTOURS_MATCH_I1` difference and `abs(log(referenceAspectRatio/candidateAspectRatio))`. `CONSISTENT` requires difference **<=0.15** and ratio difference **<=0.25**. `DIFFERENT` requires difference **>0.3** or ratio difference **>0.5**. The remaining band is `INSUFFICIENT`; algorithm errors are `UNAVAILABLE`. No physical dimensions are inferred. |
| ORB | Up to **600** grayscale keypoints; at least **8** per image to proceed. Hamming BFMatcher, k-nearest **2**, strict ratio **<0.75** and descriptor distance **<=64**. At least **4** filtered matches and available homography enable RANSAC at **3px** reprojection threshold. `RELIABLE` requires **>=8 inliers** and inlier fraction **>=0.5**. At most **40** inlier lines are drawn on analysis copies. |

Unavailable ORB/Matcher or exceptions return `UNAVAILABLE`; too few keypoints,
missing geometric support or weak inliers remain insufficient, not fabricated
matches. Other methods continue. Colour/shape errors likewise do not manufacture
negative evidence. Similar packaging is common; lighting, backgrounds, viewpoint,
different parcel sides, blurred labels and textureless wrapping limit all these
heuristics. Thresholds are review rules, not a scientifically validated identity
classifier.

### GrabCut and Manual Fallback

GrabCut is optional and disabled until a non-full parcel region is selected.
The selected region is cropped first. On that copy, `GC_INIT_WITH_RECT` uses an
inset rectangle with margin `max(2, round(min(width,height)*0.03))`, **3 iterations**,
and dimensions at least 20x20. Definite/probable foreground is retained. Foreground
coverage **<2% or >98%** is rejected as inconclusive. Missing capability, missing
region, failure or rejected mask falls back to the unsegmented selected crop.
It is rectangle-initialized segmentation, not automatic parcel recognition.
Manual parcel cropping and comparison without segmentation remain available.
OCR is never performed only on the GrabCut mask.

## Candidate Search, Counts and Ranking

Search defaults to the parcel's Malaysia-local registration day through today,
and collection status `USED` (completed collections). The UI separately offers
all recorded sessions, incomplete verification, cancelled and expired sessions.
These are collection-status filters, not a declaration of verified handover.
Dates filter collection `created_at`; the backend uses inclusive local start and
exclusive midnight after the end day. Optional dispute context is preserved.

Metadata is fetched before image bytes. Collections and expanded evidence use
pages of **20**, deduplicate evidence IDs and consume all evidence pages where
the incumbent three-row preview is incomplete. UI batch choices are **10/20**;
the hook clamps batches to 1-20. One candidate photo is fetched/analyzed at a
time. Discovery is capped at **500 photos** per search; narrower windows are
required for further discovery. Queued photos can still be completed after the
cap or cancellation. Results are locally paginated by 10, never silently discarded
for weak/inconclusive findings.

The UI shows a compact loading indicator and photos left in the current batch,
including the photo being processed. During metadata discovery it says Finding
photos without presenting the unknown full-search total. Technical counters are
kept internally, not displayed. Cancel/Continue, errors, unavailable result cards
and the discovery-limit notice remain available. A photo is failed if retrieval/
decode fails or all four methods are unavailable; partial usable/inconclusive
results are not counted as failed. The no-candidate empty state requires
completed discovery and zero discoveries.

The current staff interface opens the highest visual score after each batch,
with other photos in descending-score thumbnail rows. The search button doubles
as Cancel/Continue. Clear Results sits beside the filter heading. There is no
completion banner, result-filter panel or Analysis Details entry. The yellow
lead banner's View details reveals only the score breakdown, listing all three
checks and Cannot compare where a measurement is unavailable. Duplicate
metadata, signal badges and text findings are removed. Other matches display
a larger photo, similarity score and Compare button only. Compare changes the pair. Older processed-preview/crop
components remain separate support code, not exposed by this simplified page.
Unit and assigned-room metadata do not establish current physical location.

Support-layer review categories (shown only in selected-photo details):

1. Failed photo -> **Analysis Unavailable**.
2. Recorded matching tracking-number attempt, exact candidate OCR or reliable
   ORB plus at least 75% visual similarity -> **Strong Evidence for Review**.
3. Possible OCR, or similar colour plus consistent shape -> **Potential Match**.
4. All methods unavailable -> **Analysis Unavailable**.
5. Both colour and shape different -> **Limited Visual Similarity**.
6. Otherwise -> **Inconclusive**.

The current page ranks by descending visual score, with unavailable scores last
and stable evidence-ID ties. `recordedBarcode` comes from per-evidence
`matching_tracking_attempt`, never collection-level `matching_attempt`. Tracking
and OCR signals stay independent of the visual score. A mismatch remains a
mismatch even when its related session completes. Conflicting, lower-ranked and
failed candidates remain available through thumbnail-row pagination and Compare.

## Comparison, Cleanup and Failure Handling

Compare selects the evidence pair without changing the target parcel. The
unexposed support-layer Analysis Details component starts with **Original evidence**. Explicit
Generate Processed Preview provides **Parcel crops**, **Foreground copies** only
when both masks isolated successfully, and **ORB inlier lines** only when lines
exist. Originals stay selectable; captions identify analysis copies. Candidate
parcel/label regions can be adjusted independently and reapplied to rerun that
comparison/OCR. Preview generation otherwise skips OCR. Zoom is **1x-3x** in
0.25 steps, with pointer pan and optional fullscreen. No overlay, crop or mask
is written onto stored photos.

Each batch owns an AbortController and fresh engine; workers are disposed at
batch completion, cancellation, reset or unmount. Completed results survive
cancellation/Continue Search. Changing search filters/reference regions clears
search results; the keyed parcel/dispute workspace clears obsolete investigations.
Stale runs cannot publish results. A 401/403 clears search data; 429 pauses for
manual retry; individual missing/corrupt photo failures allow the next photo.

The OCR deadline is **45 seconds** across initialization/recognition. OpenCV
requests have a **30-second** deadline; expiry terminates the CV worker and
rejects its outstanding requests. A failed method stays unavailable for that
engine while other methods continue. These are worker-analysis deadlines, not a
general network/decode timeout guarantee. Fetches are abortable; browser stalls
and original-image decoding still have platform-dependent costs.

Candidate descriptors, Mats, vectors, matchers and homographies are deleted in
cleanup paths; computed reference features are retained only within the worker/batch,
disposed on replacement and released with worker termination. The source reference
Blob is separately retained by the page until replacement, removal, or unmount.
Transferred image buffers
avoid retaining a second main-thread visual copy. ImageBitmaps are closed,
temporary canvases reset, timers/listeners removed, and crop/detail/evidence Blob
URLs revoked on replacement or dialog/component cleanup. Preview workers are
disposed separately. No durable image/OCR cache or bulk photo preload is added.

## Authentication, Privacy and Integrity Limits

Analysis uses existing JWT Bearer **GET** requests under `/api/parcel-trace`:
`parcels/:parcelId/collections`, paged collection evidence,
`parcels/:parcelId/registration-photo`, and
`parcels/:parcelId/evidence/:evidenceId/photo`. Default `/api` and emitted runtime
assets are same-origin; deployment should retain that reverse-proxy arrangement.
The existing API helper can be configured with a different API base, so this is
not a newly enforced same-origin API allowlist. Tested runtime assets stayed
same-origin. Tokens never become image URL query parameters.

Only active Admin/Guard staff have the existing cross-unit investigation scope;
Resident, Super Admin and anonymous callers are not authorized. Frontend hiding
is not the security boundary: backend role, parcel/dispute and candidate-window
eligibility checks remain authoritative. Private collection files are not given
public URLs. Trace photo responses retain private/no-store and nosniff headers.
Analysis sends no photo/OCR payload to third parties and writes neither into
localStorage, sessionStorage, notes or the database automatically.

**Existing public registration-photo limitation:**
`backend/src/app.js` still mounts
`app.use('/uploads/parcels', express.static(parcelUploadsDirectory))` outside
authentication. Direct `/uploads/parcels/<filename>` access therefore bypasses
the authenticated investigation reader when a filename is known. Step 18E does
not expand this exposure, but its protected reader does not fix global privacy.
No backend/upload/registration workflow was rewritten in this documentation task.

**Approval-required remediation plan:** first inventory legitimate registration
photo callers and define their role/ownership rules; migrate them to authenticated
Blob reads through suitable authorized endpoints and test allowed/denied roles,
including any required Resident-own-parcel access. Only after those callers work,
remove the public mount and block equivalent proxy/static access; account for
previously cached public copies. This broader change needs explicit approval.

**Current bytes, not historical integrity:** registration images are unversioned
current assets, not immutable original-registration snapshots. Active collection
evidence can replace its current photo; an evidence ID does not pin prior bytes.
Closed-session immutability does not supply missing replacement history. Trace
reads do not repeat completion-time digest validation. Analysis and its displayed
dates therefore cannot establish historical photo integrity. Approving durable
versioned storage, digests and authenticated version reads would be a separate
contract/storage task. Original evidence is not modified by this extension.

## Executed Verification

Execution results below are confirmed by the implementation owner. The documenter
inspected the gathered source and wrote only this handoff; it did not rerun the
suites or mutate a live database.

| Check | Confirmed result and boundary |
| --- | --- |
| Focused frontend units | **11/11 passed** across `photo-analysis.test.js`, `photo-analysis-opencv.test.js`, and `parcel-trace.test.js`; includes real pinned OpenCV deterministic comparisons/GrabCut and unsupported-capability fallbacks. |
| Photo Search browser suite | **31/31 passed**, actual OCR/OpenCV workers with intercepted API/image fixtures at **1440px desktop, 834px tablet, 390px mobile**; no page horizontal overflow. Includes cancellation before first photo, continuation, partial failures, role restrictions, cleanup, immutable fixture bytes and GET-only analysis. |
| Existing Parcel Trace browser suite | **37 fixture scenarios passed**; not live browser-to-database E2E. |
| Actual runtime browser check | Exact reference/candidate OCR, similar histogram, consistent shape, reliable ORB with **600 inliers** on the deterministic same-image fixture, previews, corrupt-image rejection and same-origin runtime assets passed against the final production hash in Chrome. This does not establish real-world accuracy. |
| Injected fault paths | OCR initialization rejection -> `UNAVAILABLE` while actual colour comparison remained `SIMILAR`; accelerated 45s OCR deadline -> `UNAVAILABLE`; simulated OpenCV worker error -> all visual methods `UNAVAILABLE`. These are injected tests, not a measured real network timeout or hardware failure. |
| Visual captures | All three analysis viewports recaptured, plus full-viewport modal top/bottom captures; internal dialog scroll-to-bottom verified in browser. Captures do not prove physical-device interaction or every zoom/content combination. |
| Final production build | Passed in **8.15s**, with the warning qualifications above. Earlier 8.71s result is superseded. |
| Final JavaScript syntax | **12 analysis-module checks passed**. |
| Diff whitespace | Final document-inclusive `git diff --check` passed. |
| Focused reviewer verdict | Cancellation empty-state fix and named modal-capture limitations resolved; **ship for those named findings**, not a comprehensive product/security certification. |

No live database mutations, physical-device tests, comprehensive project-wide
regression, production throughput, mobile performance, unlimited capacity or
historical evidence-integrity guarantees are claimed.

### Reproduction Commands

Run from `/Users/kimberlycheng/Desktop/fyp_parcel_nexus`. Browser scripts require
the existing Playwright installation and a running frontend at the specified URL;
they use installed Chrome. Environment assignments below affect tests only and
do not require `.env` edits.

```sh
node --test frontend/tests/photo-analysis.test.js frontend/tests/photo-analysis-opencv.test.js frontend/tests/parcel-trace.test.js
PARCEL_NEXUS_TEST_URL=http://localhost:5180 PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/photo-analysis.browser.mjs
PARCEL_NEXUS_TEST_URL=http://localhost:5180 PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-trace.browser.mjs
PARCEL_NEXUS_TEST_URL=http://localhost:5180 PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/photo-analysis-runtime.browser.mjs
npm --workspace frontend run build
npm audit
git diff --check
```

The runtime script defaults to `/src/services/photoAnalysis.client.js` for Vite
development. For production verification, set `PARCEL_NEXUS_ANALYSIS_MODULE` to
the actual emitted `/assets/photoAnalysis.client-<hash>.js`, not a guessed hash.
The twelve `node --check` checks cover the hook, client, four utilities, worker,
asset script, and four new test scripts listed below. The JSX components were
checked by the production build, not by plain `node --check`.

## Exact Step 18E File Inventory

This is the extension inventory relative to the project root, not every
uncommitted Step 18A-D or unrelated file. Existing tests reused unchanged are not
new additions. This documentation pass writes only this file via `apply_patch`.

New files:

```text
frontend/src/components/ParcelPhotoSearch.jsx
frontend/src/components/PhotoAnalysisPreview.jsx
frontend/src/components/PhotoAnalysisFindings.jsx
frontend/src/components/PhotoRegionDialog.jsx
frontend/src/hooks/useParcelPhotoSearch.js
frontend/src/services/photoAnalysis.client.js
frontend/src/utils/photoAnalysisPolicy.js
frontend/src/utils/photoCandidateCursor.js
frontend/src/utils/photoPreprocessing.js
frontend/src/utils/openCvComparison.js
frontend/src/workers/photoAnalysis.worker.js
frontend/src/styles/photo-analysis.css
frontend/scripts/imageAnalysisAssets.js
frontend/tests/photo-analysis.test.js
frontend/tests/photo-analysis-opencv.test.js
frontend/tests/photo-analysis-runtime.browser.mjs
frontend/tests/photo-analysis.browser.mjs
frontend/docs/parcel-photo-analysis.md
```

Modified integration files:

| File | Step 18E change |
| --- | --- |
| `frontend/src/pages/ParcelTracePage.jsx` | Inserts Photo Search and carries selected analysis filter context into existing evidence reads. |
| `frontend/src/styles.css` | Imports scoped `photo-analysis.css`. |
| `frontend/package.json` | Pins the three analysis dependencies. |
| `frontend/vite.config.js` | Registers local analysis asset serving/emission plugin. |
| `package-lock.json` | Locks analysis dependencies and transitive packages. |

No backend, migration, design/token or `.env` file belongs to this Step 18E
extension inventory. Existing `api.js` trace helpers, evidence viewer and
`parcel-trace` suites are reused.

## Manual QA and Browser Limits

Current Chrome was verified. The runtime requires Web Workers, WebAssembly,
Canvas/ImageData and image decoding; dialogs/pointer events support the review
UI. Fullscreen is optional. Other browser engines/versions and physical mobile
devices remain unverified. No camera access is needed for this analysis flow.
Low-memory/slow devices, high-resolution decoding, CPU throttling and expensive
OCR/GrabCut can exceed deadlines. Reduce the window/batch/crops or use manual
evidence review; unavailable analysis is not a negative finding.

1. With approved nonproduction evidence, sign in as Admin and Guard. Confirm
   opening Parcel Trace does not load analysis workers or candidate photos;
   Resident/Super Admin cannot enter the analysis workspace.
2. Select the correct duplicate tracking-number record. Search completed
   collections, then separately inspect incomplete/cancelled categories; check
   collection date boundaries, dispute context and unchanged mismatch labels.
3. Use known printed labels, ambiguous characters, blank/blurred images and
   different packaging. Review method-level findings and target-only snippets;
   do not interpret priority as probability or completed handover.
4. Try 10/20-photo batches, expanded evidence pages, missing/corrupt photos,
   cancellation before the first result and after a completed result, Continue
   Search, date changes, a different parcel and navigation away. Check remaining
   batch counts, retained results, unavailable rows and stopped obsolete work.
5. Confirm the closest comparison opens automatically, other thumbnails are
   ordered highest to lowest, and Compare switches the pair. Expand View details
   in the yellow banner to check recorded metadata and score weighting. Confirm
   there are no result-filter controls or Analysis Details buttons. Enlarge the
   original photos and check zoom, Escape and focus return.
6. Repeat at 1440/834/390px, including long tracking text and errors. Check no
   page overflow, stacked mobile comparison and contained zoom/vertical scroll.
7. In a controlled session, test access expiry/rate limiting and retry without
   creating public collection URLs or persisting image/OCR data. Confirm Parcel
   Trace does not request notes/timeline data or write investigation status/notes.

These are reproduction/manual review instructions, not additional executed
physical-device or live-data test claims.

## Step 18F Integration Requirements

Step 18E supplies a verified browser-side support layer for Step 18F integration,
within the limitations above. Preserve explicit initiation, authorized reads,
bounded batches/cancellation, original-vs-analysis provenance, method-specific
unavailable states and transparent ranks. Do not promote heuristics to identity
scores without an independently validated model and approved contract.

Step 18F must not automatically accuse Residents, assign responsibility, resolve
disputes, change ownership, complete collections or change parcel/investigation
statuses. Do not auto-fill the human review checklist or overwrite staff notes.
Existing note payloads do not accept arbitrary analysis objects; any durable
analysis record/export requires approved schema, privacy, provenance/version and
audit design first. Keep investigation/dispute status independence. Broader
public-registration privacy and historical-byte/version remediation remain
explicitly approval-required work, not silently bundled into Step 18F.
