# Step 18F: Integration and Security Results

## Scope and Test Plan

Feature 18 was tested as implemented, without redesign, new dependencies,
business-rule changes, new migrations, or `.env` edits. Earlier uncommitted
Feature 17/18 and authentication changes were inspected and preserved.

The plan was: record production counts and row/upload hashes; use ephemeral
PostgreSQL 16 for all writable tests; apply/replay migrations 001-016; run existing
regressions; run independent authenticated browsers against real Express,
Socket.IO and PostgreSQL; verify actual OCR/OpenCV; fix confirmed defects only;
compare original data again; remove the isolated environment.

Existing suites covered validation, ownership, expiry, immutable history,
collection atomicity, investigation transitions and responsive fixture states.
The new live harness covers real commits, browser/API integration, Socket events,
concurrent confirmation and migration replay with populated records. Physical
phone-camera and external delivery tests remain manual.

## Data Safety

The existing database was used only for read-only counts, hashes, catalogs and an
anonymous registration-photo HTTP probe. Baseline counts were:

| Record | Before / verified after |
| --- | --- |
| Users | 12 / 12 |
| Parcels | 48 / 48 |
| Collections | 15 / 15 |
| Verification sessions | 1 / 1 |
| Barcode attempts | 1 / 1 |
| Verification evidence / accepted collection photos | 1 / 1 |
| Disputes | 9 / 9 |
| Investigations | 1 / 1 |
| Investigation notes | 0 / 0 |
| Audit logs | 69 / 70 (one new Guard Login during the test window) |
| Existing upload files | 68 / 68 |

`feature18-baseline.mjs` compared row-digest multisets for every public table and
SHA-256 values for all existing uploads/private uploads. All pre-existing values
and bytes were unchanged. A subsequent ordinary Guard Login was appended to the
project audit trail (13 October 2026, 23:57:04 Malaysia time) and was preserved;
none of the 69 pre-existing audit entries changed or disappeared. Writable test
fixtures remained in isolated databases. Read-only catalog checks found zero unvalidated
constraints and 21 Feature 18 indexes.

An ephemeral `parcel-nexus-18f-test` container used tmpfs, localhost port 55432,
and no project database volume. Each live run created a separate database inside
that isolated instance. Real test commits and append-only history were retained
there until environment removal; no production audit/attempt rows were deleted.
Test uploads used unique temporary working directories, not project uploads.
A missing-photo test temporarily moved one dedicated fixture file and restored
it in `finally`. Production evidence was never overwritten or removed.

## Confirmed Defects and Focused Fixes

### Public registration photographs

The old `/uploads/parcels` Express static mount returned **200** without a JWT and
`Cache-Control: public, max-age=0`. That was a confirmed privacy defect.

The same URL shape now uses `parcelPhoto.routes.js`:

- Authentication and active-account checks are mandatory.
- Admin/Guard can read operational photos, including uploaded unsaved previews.
- Residents can read only photos referenced by non-deleted parcels in their unit.
- Super Admin is denied; anonymous/invalid/expired tokens receive 401, foreign
  Resident access receives 404, and Super Admin receives 403.
- Generated filenames are allowlisted; no filesystem path is returned.
- Responses use `private, no-store` and `nosniff`; failed reads are generic.

Existing parcel photo fields/URLs remain unchanged. Parcel details and staff edit
previews now use authenticated Blob reads through the shared API helper, including
abort/URL cleanup and existing session-expiry behavior. Arbitrary external image
URLs are not sent JWTs. Existing stored registration paths were all canonical.
The running Docker backend was re-probed: anonymous access now returns **401**.
Previously downloaded or cached public copies cannot be recalled by this fix.

### OCR initialization worker leak

An actual missing-language-asset test showed that Tesseract's initialization
promise could remain unresolved while its native worker stayed alive after
engine disposal. This was not merely an injected mocked failure.

The client now owns `photoOcr.worker.js` before initialization. That host owns
Tesseract's child worker, forwards only target-related OCR findings, and can be
terminated on initialization errors, timeout, cancellation and disposal. Chromium
DevTools checks confirmed zero remaining analysis host/child worker targets after
missing assets and cancellation during language initialization. Existing 45s OCR
and 30s OpenCV deadlines are unchanged. Nested-worker support on other browser
engines remains a manual compatibility check.

### Outdated regression expectations

The parcel-room regression still expected Guard scanning to finish collection
and read rooms from the old completion shape. It was updated to submit Resident
barcodes/photos, confirm as Resident, and read immutable room snapshots from
`verification_session.parcels`. No collection permission/status rule was changed.
Generated fixture photos are cleaned up after rollback.

## Executed Results

Counts below are per suite, not a fabricated combined count of independent
business scenarios. Node test totals include integration parent tests.

| Verification | Final result | Boundary |
| --- | --- | --- |
| Selected backend regressions | 74 passed, 0 failed, 0 skipped | Real HTTP/PostgreSQL fixtures for collection/trace/rooms/report contracts; notification/provider adapters are mocked where specified |
| Selected frontend units | 53 passed, 0 failed | Collection, Guard, trace, photo policy/OpenCV, room, audit and chatbot units |
| Live integration harness | 14 groups passed, 0 failed | Real Express, PostgreSQL commits, independent Chromium clients and live Socket.IO; synthetic Guard camera |
| Resident collection browser regression | 71 scenario assertions passed | Intercepted API fixtures; desktop/tablet/mobile; synthetic camera |
| Guard collection browser regression | 23 scenarios passed | Intercepted API fixtures; actual ZXing decoding of synthetic frames |
| Parcel Trace browser regression | 37 scenarios passed | Intercepted API fixtures including dispute routing and note/status controls |
| Photo-search browser regression | 31 scenarios passed after the OCR fix | Actual OCR/OpenCV workers; intercepted metadata/evidence |
| Actual runtime/fault paths | Passed | Known-label OCR, histogram/shape/ORB, corrupt image, same-origin assets; explicitly injected initialization/accelerated deadline faults |
| Missing-assets/cancel cleanup | Passed | Actual blocked language assets and cancellation during initialization; host/child worker targets gone |
| Extended algorithm matrix | 11 image variants plus GrabCut/fallback/EXIF passed | Actual browser algorithms; controlled synthetic photos, not real-world accuracy claims |
| Production build | Passed, 9.23s final source build | Existing large-chunk and OpenCV Node-branch externalization warnings remain |
| Backend/source/test syntax | 94 checks passed | JSX checked through production build |
| Whitespace/integrity | Passed | `git diff --check`, original row/upload hashes and isolated populated migration replay |

The first backend run had two stale child checks fail (and their integration
parent), corrected as above. Early live harness failures also included wrong test
field/status assumptions, response-wait/selector mistakes and intermittent
synthetic QR scan timeouts. The final complete live run passed with actual ZXing
decoding. The scanner application was not patched without a confirmed product
cause; synthetic-camera timing stability and physical device behavior remain
explicit QA caveats. The observed OCR worker leak was reproduced before fixing.

Live checks include QR generation in Resident UI, two-minute QR policy, Guard
scan starting rather than collecting, backend fifteen-minute deadline, per-parcel
verification/upload gates, Guard progress/refresh, Resident-only confirmation,
idempotent retries, real simultaneous confirmation requests, and a temporary
isolated database trigger forcing audit failure/transaction rollback.

They also include real cross-unit mismatches and cancelled evidence, on-demand
photo search over 13 database-backed photos (12 analyzed, one missing-file failure),
Cancel/Continue, source-byte hashes, investigation creation, real notes/statuses,
reopening, dispute return/investigate buttons, JWT/role/path/input restrictions,
filtered audit CSV and migration replay preserving every committed row digest.
No photo analysis automatically changed a dispute or collection status.

Full QR/session expiry, malformed/oversized uploads, append-only rejection,
invalid/tampered evidence, overlapping reservations, rate limits and SQL-looking
inputs were additionally exercised by existing real HTTP/PostgreSQL integration
tests. Controlled isolated expiry fixtures were used; production expiry constants
were not shortened. Wall-clock physical 2/15-minute waiting remains manual QA.

## Measured Limits and Accuracy

Local Chromium observations from the recorded final runs:

- Live photo search, including cancellation/continuation: 4,021ms for 13 controlled
  candidate records (one failed file); fixture PNG size 52,640 bytes.
- One paginated API sample each: barcode 4.67ms, collections 5.01ms, timeline
  10.13ms. This is a small isolated dataset, not a load/production benchmark.
- Matrix initialization: 516ms; variant comparisons: 150-260ms in that run.
- Three repeated analysis/disposal cycles: main-thread heap after explicit GC was
  5,850,448 / 5,850,424 / 5,850,424 bytes; remaining analysis worker targets 0/0/0.
  This does not measure total process, worker/WASM RSS, iPhone memory or prove no
  leak under all workloads.
- OpenCV worker remains approximately 10.8MB raw; OCR host approximately 16.74KB,
  selected core 3.9MB and English data 2.95MB. Full analysis asset deployment is
  about 25.6MB raw across all cores. Lazy loading remains explicit; no unlimited
  free-hosting or low-end-device performance guarantee is claimed.

Readable/low-light fixture labels returned Exact; moved/ambiguous labels returned
Possible; rotated, blurry, obscured, absent and low-texture labels were Inconclusive;
the different-label fixture returned No Matching Text. A same-packaging,
different-label fixture still produced 138 ORB inliers. This demonstrates why
geometric matches and packaging colour are supporting evidence, not identity or
responsibility proof. No identity probabilities were introduced. GrabCut actually
isolated the selected foreground; missing initialization used the manual-crop
fallback. EXIF orientation 6 correctly swapped 1600x1000 to 1000x1600.

## Registration Evidence Integrity

Uploads use new timestamp/UUID filenames; the parcel editor changes its pointer
and does not overwrite/delete the old file. However, no immutable original pointer
or version history associates those older files with the parcel. Parcel Trace reads
the current registration photo. Generic Parcel Edited events exist, but photo
metadata only compares presence, so replacing one non-null photo with another is
not specifically described. Historical registration images cannot be reliably
reconstructed from that audit trail. Existing collection confirmation hash checks
and closed evidence immutability remain unchanged.

A small future proposal is an immutable original-registration reference/digest
captured for new registrations, while retaining the current edit pointer. Legacy
rows must remain unknown, never fabricated. This needs an approved schema/retention
contract; no evidence-versioning migration was introduced in Step 18F.

## Changed Files

New: `backend/src/routes/parcelPhoto.routes.js`,
`backend/tests/feature18-baseline.mjs`, `backend/tests/feature18-live.mjs`,
`frontend/src/workers/photoOcr.worker.js`,
`frontend/tests/photo-analysis-assets.browser.mjs`,
`frontend/tests/feature18-analysis.browser.mjs`, this report and
`frontend/docs/feature18-manual-testing.md`.

Modified: `backend/src/app.js`, `backend/tests/parcel-rooms.test.js`,
`frontend/src/services/api.js`, `frontend/src/components/ParcelDetailsDialog.jsx`,
`frontend/src/pages/ParcelManagementPage.jsx`,
`frontend/src/services/photoAnalysis.client.js`, and historical handoff addenda in
`backend/docs/collection-verification.md`, `backend/docs/parcel-trace.md`,
`frontend/docs/parcel-photo-analysis.md`.

No business tables/migrations, production records, role assignments, expiry values,
Socket namespace, notification adapters, frontend design/CSS, dependencies or
environment files were changed for Step 18F.

## Reproduction and Demonstration Gate

The guarded live harness only accepts `FEATURE18_LIVE_INTEGRATION=true` and the
isolated localhost:55432 database named `parcel_nexus_18f`. It then creates a fresh
run database and applies the normal migrations. It must not be pointed at the
project database. Build the frontend first; ports 5100/5181 must be free. It starts
and closes its own real test server/preview and removes its unique test upload
directory. The temporary PostgreSQL container must be removed after tests.

```sh
FEATURE18_LIVE_INTEGRATION=true DATABASE_URL=postgres://feature18:Feature18IsolatedOnly@127.0.0.1:55432/parcel_nexus_18f PLAYWRIGHT_MODULE=<existing-playwright-path> node backend/tests/feature18-live.mjs
```

See [manual testing](../../frontend/docs/feature18-manual-testing.md) for tests A-L.
Software integration is ready for a supervised local demonstration. Final device
demonstration sign-off requires physical rear-camera/real-label scanning, HTTPS
permission behavior, two-device network/reconnect/expiry checks and manual photo
assessment. External Email/Browser Push delivery, mobile thermal/memory limits,
long-run/load testing and historical registration integrity are not certified by
these tests. No further feature was started.
