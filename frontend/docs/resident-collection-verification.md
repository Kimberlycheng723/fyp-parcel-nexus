# Step 18B: Resident Collection Verification

## Scope and Incumbent Evidence

Resident integration extends the existing Resident-only `/parcel-collection`
route; no new route or role permission is introduced. My Parcels still generates
one QR for the selected pending parcels. Guard scanning starts verification, not
collection. Only the owning Resident can confirm all selected parcels together.

This is an incumbent Operate extension, not a new visual world. Existing
typography, navy/neutral palette, protected layout, icons, QR panels, buttons and
status/message conventions remain the reference. Evidence:
[base.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/base.css),
[parcel-collection.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/parcel-collection.css),
[ResidentCollectionPage.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/pages/ResidentCollectionPage.jsx),
and scoped [collection-verification.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/collection-verification.css).
Verification uses labelled per-parcel cards, text/icon statuses, a progress bar,
and visible focus states. The two-column grid becomes one column at 1100px and
below; summary/photo/action layouts stack at 640px and below. No DESIGN.md,
palette/token rewrite, new dependency, backend, migration or `.env` change belongs
to this step. Existing `@zxing/browser`, `qrcode` and Socket.IO clients are reused.

## Exact API Integration

All paths below include the default `/api` prefix. Existing `apiRequest` and
`apiDownload` retain Bearer JWT handling and the shared 401 session-expiry flow.
See [api.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/services/api.js)
and the authoritative [backend contract](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/docs/collection-verification.md).

| Method | Path | Request / Response Used |
| --- | --- | --- |
| POST | `/api/resident/collections` | `{ parcel_ids: [...] }`; existing `collection` with token and expiry |
| GET | `/api/resident/parcels/:parcelId` | Existing unit-scoped `parcel`; refresh waiting-state room labels |
| GET | `/api/resident/collection-verifications/active` | `{ verification_sessions: [...] }`; discover own active session |
| GET | `/api/collection-verifications/:sessionId` | `{ verification_session }`; restore/refresh authoritative state |
| POST | `/api/collection-verifications/:sessionId/parcels/:parcelId/barcode` | `{ scanned_tracking_number: "..." }`; authoritative updated session |
| PUT | `/api/collection-verifications/:sessionId/parcels/:parcelId/photo` | Multipart single `photo` file; authoritative updated session |
| GET | `/api/collection-verifications/:sessionId/parcels/:parcelId/photo` | Authenticated image Blob, not a public image URL |
| POST | `/api/collection-verifications/:sessionId/confirm` | Exactly `{}`; session and collection, including idempotent completion |
| POST | `/api/collection-verifications/:sessionId/cancel` | Exactly `{}`; updated session, cancellation is idempotent |

The unchanged Guard request is POST `/api/guard/collections/verify` with `{ token }`;
Step 18A now returns `verification_session` without marking parcels collected.
Resident barcode/photo/confirm/cancel operations remain Resident-only. Session
and photo reads also permit the initiating Guard or Admin under backend scope;
neither can perform Resident confirmation. Foreign/nonexistent records yield
404, forbidden roles 403, conflicts/incomplete state 409, expiry 410 and limits
429. The frontend reports errors without client-side ownership lookups.

## State, Expiry and Restoration

[useCollectionVerification.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/hooks/useCollectionVerification.js)
discovers the session matching the saved collection; without a collection it
can discover the first own active session. A matching saved session identifier
uses the authorized detail endpoint instead. It distinguishes waiting, QR
expired, `AWAITING_VERIFICATION`, `EXPIRED`, `CANCELLED`, `COMPLETED`, empty and
unavailable states. Temporary failures show retry while preserving server progress;
401/403/404 stop automatic checks and show unavailable/sign-in guidance.

The QR lasts two minutes. Verification lasts 15 minutes from the actual backend
Guard scan. Server `expires_at` values drive both countdowns; refresh never starts
a new deadline. Active verification replaces the QR and uses its own deadline.
At zero, actions are disabled while REST checks resolve session expiry. QR expiry
is concluded only after successful authorized discovery finds no linked session;
regeneration checks for an active linked session before creating another QR.

Visible waiting/active states poll every three seconds, scheduled after each
read, without overlapping reads. Mutation coordination aborts an in-flight read
and pauses polling. Hidden tabs stop scheduled polling; visibility and Socket
reconnection trigger reads. Terminal states stop automatic polling. Timers,
requests, listeners and shared Socket consumers are cleaned up on unmount.
Existing `collection:verification-started` and `collection:completed` events
trigger authorized REST refreshes, never fabricated sessions or local completion.
REST remains the fallback; actual cross-device Socket delivery is not verified.

[collectionSession.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/utils/collectionSession.js)
adds `parcel_nexus_collection_verification` in sessionStorage containing only
`session_id`, `collection_id`, `resident_id`. Restoration checks account and,
when supplied, collection identity. Barcode progress/photos come from the server.
The existing QR sessionStorage entry `parcel_nexus_resident_collection` is retained
(including its token/selection), now with a Resident owner field; a mismatched
owner is discarded. No evidence or QR secrets are added to localStorage. New QR
saves clear the verification reference; completion clears the QR entry, and return/
restart clears both references before navigating to My Parcels, which reloads data.

## Barcode, Photo and Final Confirmation

[CollectionBarcodeScanner.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/components/CollectionBarcodeScanner.jsx)
uses ZXing `BrowserMultiFormatReader`, not a QR-only reader. Camera permission is
requested only when scanning opens, with rear-facing camera preference. Detection
is deduplicated; tracks stop after detection, close, unmount, hidden-tab interruption
or a 25-second no-result timeout. Denied/busy/missing cameras and unsupported
browsers offer retry/manual entry. Camera `getUserMedia` requires a secure context
(HTTPS or localhost); no environment change is made here.

[CollectionVerificationParcel.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/components/CollectionVerificationParcel.jsx)
submits scanned and manual values to the same barcode endpoint. Printable input
is trimmed and limited to 120 characters; matching and ownership remain backend
decisions. Only returned `barcode_status: MATCHED` marks verification successful.
Mismatch remains visible and retryable. No OCR or physical authenticity claim is
made; manual entry is the fallback for unreadable labels.

Photos use a native file input with `capture="environment"` plus a separate file
chooser, both accepting `image/jpeg,image/png`. Client validation rejects empty,
unsupported or over-5-MB files (5 * 1024 * 1024 bytes); backend byte validation
remains authoritative. Preview/retake/discard is local. Upload occurs only on
`Use & Upload Photo`, and only returned `photo_present` marks it stored. One current
photo per parcel may be replaced while active, not after completion/expiry/cancel.
Protected saved photos are fetched through `apiDownload` and displayed via Blob
URLs; temporary URLs are revoked and obsolete fetches aborted. Failed uploads
retain the chosen preview for retry; failed protected reads offer photo retry.
Every local photo preview, including a replacement for an already uploaded photo,
must be successfully uploaded or explicitly discarded before final confirmation.
Pending previews block confirmation and exclude their parcels from ready progress;
the previously stored photo is not silently accepted in place of a new preview.
Scanner/manual-entry controls manage keyboard focus and restore it to the trigger
after closing or submitting. Barcode/photo success feedback uses live status text.

[collectionVerification.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/utils/collectionVerification.js)
enables one final `Confirm Collection` only for a nonempty, unexpired active session
where every parcel has `MATCHED` and `photo_present === true`. The page additionally
requires no pending photo previews, blocks duplicate confirmation, freshly reads
the session, then sends `{}` only if still
ready. Backend atomic completion is authoritative; no partial/local collection or
second Guard confirmation is introduced. A returned `COMPLETED` session, including
`already_completed: true`, shows success without depending on a nonempty parcel
array. Cancel sends `{}` after a cancellation prompt. Closed sessions show restart
guidance; confirmation is never retried automatically.

## Targeted Validation Status

Final executed results reported by the implementation owner: exactly 8/8 focused
Node unit checks passed; the complete post-refinement browser suite passed 71
scenario assertions. Fixture flow and capture checks passed at 1440px, 834px and
390px with no horizontal overflow. The production build passed after the fix batch
with the pre-existing large-chunk warning, and `git diff --check` passed. These
results were not rerun by the documenter.

Browser coverage includes actual ZXing Code128 decoding from synthetic camera
streams, camera cleanup, photo replacement with explicit acceptance, pending-preview
confirmation blocking, keyboard focus restoration, success live-status feedback,
upload failure/retry, network retry, 429 recovery, hidden-tab polling, 404 ownership
failure handling and staff-role route restrictions.

Focused references (not rerun by the documenter):

```sh
node --test frontend/tests/collection-verification.test.js
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/collection-verification.browser.mjs
```

Browser target: `PARCEL_NEXUS_TEST_URL`, default `http://localhost:5173`.
Screenshots: `/private/tmp/parcel-nexus-collection-<name>-<width>.png`.
Browser API requests are intercepted and sockets blocked: fixture mutations never
reach the backend. Camera streams are synthetic, not physical. No live Socket
delivery, physical-device QA, actual backend end-to-end Step 18B test, backend test
rerun or full project regression is claimed here.

Manual device checks remain: on physical iPhone and Android over HTTPS, check
rear-camera permission/denial, scan actual courier formats, close/background track
cleanup, native capture/retake/file picker and JPG/PNG size handling. With genuine
accounts/parcels, check separate Guard/Resident devices, live Socket plus REST
fallback, refresh restoration, both expiry windows, cancellation, protected photo
replacement and one atomic Resident confirmation. Browser fixture results do not
establish those live behaviors.

## Files and Step 18C Handoff

New five source files: `frontend/src/hooks/useCollectionVerification.js`,
`frontend/src/components/CollectionBarcodeScanner.jsx`,
`frontend/src/components/CollectionVerificationParcel.jsx`,
`frontend/src/utils/collectionVerification.js`,
`frontend/src/styles/collection-verification.css`.
New tests: `frontend/tests/collection-verification.test.js` and
`frontend/tests/collection-verification.browser.mjs`.
New documentation: `frontend/docs/resident-collection-verification.md`.
Modified: `frontend/src/pages/ResidentCollectionPage.jsx`,
`frontend/src/pages/DashboardPage.jsx` (QR-session owner field only for Step 18B),
`frontend/src/services/api.js`, `frontend/src/utils/collectionSession.js`,
`frontend/src/styles.css` (scoped stylesheet import). Earlier working-tree changes
are not attributed to this step.

Resident integration is implemented, final targeted checks have passed, and it is
ready to hand to Step 18C, not a completed end-to-end release. Guard UI still has old
success/collected labels and must be aligned in Step 18C; do not treat those labels
as backend completion or restore Guard finalization. Backend chatbot guidance
still contains old Guard-finalizes copy and remains outside this frontend scope.
No Parcel Trace, OCR/image comparison, notification redesign or unrelated work is
included.
