# Step 18C: Guard Collection Verification

## Scope and Incumbent Evidence

The existing Guard-only `/verify-collection` route now starts and monitors
Resident verification instead of showing collection success on QR scan. Guard
scanning leaves parcels pending; the Resident alone verifies barcodes, explicitly
uploads photos and confirms all selected parcels together. No second Guard
confirmation, partial collection, new route or role permission is introduced.

This incumbent Operate extension retains the protected layout, typography,
navy/neutral palette, existing QR scanner, buttons and labelled status/message
patterns. Evidence: [GuardVerifyCollectionPage.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/pages/GuardVerifyCollectionPage.jsx),
[GuardCollectionStatus.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/components/GuardCollectionStatus.jsx),
[base.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/base.css),
[parcel-collection.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/parcel-collection.css)
and scoped [guard-collection-verification.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/guard-collection-verification.css).
Text/icons distinguish started, progress, completion and closed states without
depending on colour alone. At 640px and below, overview/footer stack and parcel
checks wrap below their identities. No PRODUCT/DESIGN files, visual-world/token
changes, schema/migrations, `.env` or dependency changes are part of Step 18C.

## APIs and Permissions

Only these collection APIs are called by the Guard page/hook, through the existing
Bearer-authenticated [api.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/services/api.js) helpers:

| Method | Endpoint | Contract |
| --- | --- | --- |
| POST | `/api/guard/collections/verify` | Exactly `{ token }`; start or retrieve own initiated active verification |
| GET | `/api/collection-verifications/:sessionId` | Read known session; backend requires this Guard to be its initiating Guard |

Both return `{ verification_session }`. The UI checks session ID, initiating
`guard_id`, supported status, parcel array and backend expiry before accepting
the response. Authorization remains backend-owned. No Resident active-list,
barcode, upload, confirm or cancel API is called. Guard has no corresponding
mutation controls. Private photo bytes are not fetched: only returned photo
upload status is displayed, even though scoped protected-photo reads exist in
the backend. No public evidence URL or internal storage path is exposed by this UI.

See the authoritative [Step 18A contract](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/docs/collection-verification.md).
An initial QR is valid for two minutes. Explicitly rescanning the same existing
VERIFYING QR as its initiating Guard returns the same active session, even after
the original QR deadline; it neither creates another session nor extends expiry.
Another Guard cannot take it over. Used/completed, cancelled or expired QR requests
are rejected. Failed requests are never automatically resubmitted. For a POST
network failure or 5xx only, Refresh Verification explicitly resends the existing
POST `{ token }` from a short-lived callback/ref on the current page. This can
retrieve the same active session after a lost acknowledgement without reopening
the camera, even if the Resident QR has already disappeared. Backend same-Guard
VERIFYING semantics prevent a new session or deadline extension. The decoded QR
is not written to browser storage, DOM text or logs; its retry reference is cleared
on success, new scan or unmount. Used/expired/permission failures do not offer this
callback. Scan Another QR/Try Again starts an explicit new scan instead.

## Lifecycle and Detection

[guardCollectionVerification.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/utils/guardCollectionVerification.js)
accepts exactly four backend session statuses:

- `AWAITING_VERIFICATION`: initially Verification Started / Awaiting Resident
  Verification; evidence activity displays Verification In Progress. Every parcel
  with `MATCHED` barcode and `photo_present` yields Awaiting Resident Confirmation,
  never inferred completion.
- `COMPLETED`: Collection Completed / Confirmed by Resident, with backend parcel
  count and Malaysia-time confirmation timestamp.
- `EXPIRED`: Verification Expired; Resident must restart collection.
- `CANCELLED`: Verification Cancelled; description is specifically "This
  verification session has been cancelled.", not a claim about other sessions.

These friendly progress labels are not new stored states. Unit, courier, registered
tracking number and room names come from authorized session snapshots. Null rooms
display Not Assigned. Per-parcel barcode/photo indicators and aggregate ready
count use returned evidence. Only backend `COMPLETED` displays collected results.
The 15-minute verification deadline is backend `expires_at`, independent of QR
expiry; refresh cannot reset or extend it. A local zero countdown says Checking
session expiry while authorized reads resolve the actual terminal state.
An atomic polite live-status announcement includes the phase and screen-reader-only
verified count. The changing countdown is not a live region.

[useGuardCollectionVerification.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/hooks/useGuardCollectionVerification.js)
uses three-second polling scheduled after reads, only while monitoring an active
session. Reads do not overlap; hidden tabs pause scheduling and visible tabs
refresh. Terminal states stop automatic polling. Unmount/session changes clear
timers/listeners and abort reads. Temporary network/server failures retain known
progress and offer Refresh Status; invalid/auth/ownership responses stop monitoring
and show unavailable guidance. Shared JWT session-expiry handling is unchanged.

The existing backend `collection:verification-started` and `collection:completed`
events target the Resident only. **Guard has no collection Socket listener.** No
namespace/recipient changes were made. Resident's existing Socket-triggered reads
and polling remain unchanged; Guard detects completion through authorized REST.
No live Socket delivery claim follows from fixture synchronization.

Guard sessionStorage key `parcel_nexus_guard_verification` stores only
`{ guard_id, session_id }`, checked against the signed-in Guard. QR tokens, evidence
and progress are not persisted there or added to localStorage. Refresh restores
the known ID via GET without opening the scanner. There is no Guard active-list
endpoint: cleared storage/new-device recovery requires an explicit same-Guard
rescan of the existing VERIFYING QR while active, only if the original QR is still
available. There is no automatic discovery endpoint. The in-memory lost-ack retry
works only until unmount and does not remove this new-device limitation. Foreign
Guard references are ignored locally; backend ownership still prevents access.
Closed sessions cannot be rediscovered by QR; they can be read when the authorized
ID is still known.

Scan Next QR releases the old monitor/reference and returns to scanning. It does
**not** cancel, reset or mutate the backend session; Resident verification continues
independently. Only one current Guard session is monitored, not a queue of sessions.

## Scanner and Copy

The existing ZXing `BrowserQRCodeReader` is retained, with rear-camera preference,
inline muted preview, capability-checked torch and duplicate submission guard.
Camera tracks stop on detection before POST, close, unmount, hidden-tab interruption,
startup failure or 25-second no-result timeout. The no-result heading is QR not
detected, distinct from Camera unavailable. Recovery is explicit. Permission,
unavailable/busy camera and preview failures have friendly messages. `getUserMedia`
requires HTTPS or localhost; physical Safari/rear-camera/torch behavior still needs
device QA, without an environment change in this step.
Initially hidden pages do not request camera permission; explicit Start Scanner
is required after returning. Interrupted startup is guarded and toolbar labels
distinguish Starting camera and Camera stopped from the ready scanner caption.
Synthetic tracks without torch support display Torch unavailable on this device;
fixture readiness waits for that caption and the loading overlay to disappear.

Collection-only wording was aligned in the Guard Dashboard paragraph, login story
and preview text. [backend/src/utils/chatbot.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/utils/chatbot.js)
now explains Guard-started verification, separate expiry windows, every barcode/
explicit photo upload and Resident-alone atomic confirmation. Focused chatbot
assertions protect this guidance. No Gemini provider/configuration, chatbot tool
or business-logic changes are attributed to Step 18C. Earlier 18A/18B handoffs
remain historical; this document records the current Guard integration.

## Targeted Evidence

Executed results reported by the implementation owner, not rerun by the documenter:

- Final combined focused Guard/shared Resident units passed 15/15.
- Complete Guard/Resident browser suite passed 23/23 scenarios after all code
  changes, with intercepted fixtures at 1440px, 834px and 390px and no overflow.
  Actual ZXing QR decoding used synthetic streams. Coverage includes camera
  hide/pause/restart/close cleanup, initial-hidden startup without permission,
  clock-accelerated 25-second no-QR timeout and explicit lost-acknowledgement
  Refresh Verification with unchanged camera-request count and `startCount === 1`.
- Latest production build passed with only the pre-existing large-chunk warning.
- Focused mocked chatbot tests passed 29/29 and real collection HTTP/PostgreSQL
  checks passed 12/12 before the final frontend-only fixes. Backend source remained
  unchanged after those passes. Database fixtures rolled back and private test
  files were cleaned up; this is not live-browser database E2E.
- Two touched backend syntax checks, all new JavaScript/test syntax checks and
  `git diff --check` passed.
- Updated older parcel-room/collection/disputes browser fixture passed syntax
  checking only; its full suite was not executed. Focused Guard cases cover rooms.

Browser APIs are intercepted and sockets blocked: fixture mutations never reach
the backend. No physical-device, live Socket delivery, live-browser database E2E
or Gemini-provider validation is claimed. No comprehensive regression was run.
Finish review verdict is Ship with both material findings resolved. Refinements
include session-specific cancellation wording, atomic polite phase/count
announcements (not the countdown), truthful scanner labels and hidden-start
hardening. No Resident source or additional backend logic was changed. The final
bounded review also cleared the mobile network-retry and no-QR timeout captures;
no material fixes remain within that review's scope. Reviewers inspected source
and captures, not physical devices or live Socket delivery.

Focused browser entry: `frontend/tests/guard-collection-verification.browser.mjs`,
using existing `PLAYWRIGHT_MODULE` and optional `PARCEL_NEXUS_TEST_URL` (default
`http://localhost:5173`). Captures use
`/private/tmp/parcel-nexus-guard-verification-<name>-<width>.png`.

## Manual Two-Device Check

1. On physical Resident and Guard devices over HTTPS, use genuine accounts and
   pending parcels. Resident generates one multi-parcel QR; Guard scans it within
   two minutes. Confirm both screens show verification, not collected parcels.
2. Hand over only the listed parcels. Resident verifies each barcode and explicitly
   uploads each photo. Guard should see polling-driven progress, then Awaiting
   Resident Confirmation, with no confirm/upload/cancel controls or photo images.
3. Refresh Guard and verify the same backend deadline/progress restores without
   camera startup. Hide/show the tab and test temporary network interruption.
   Check Resident Socket delivery separately from its REST fallback.
4. Resident alone confirms once. Both screens must reflect backend completion for
   all parcels, then Guard polling stops. Check Resident preview upload/discard
   gating and Guard camera/torch permissions and track cleanup on real devices.
5. Test a lost initiation acknowledgement: Refresh Verification should recover the
   same active session without another camera request or deadline change. In separate
   genuine attempts, check cancellation/expiry and same-Guard active
   QR rescan recovery. Scan Next must leave Resident verification intact; another
   Guard must not take over. Never interpret QR scan or ready progress as completion.

## Files and Readiness

New four source files: `frontend/src/components/GuardCollectionStatus.jsx`,
`frontend/src/hooks/useGuardCollectionVerification.js`,
`frontend/src/utils/guardCollectionVerification.js`,
`frontend/src/styles/guard-collection-verification.css`.
New tests: `frontend/tests/guard-collection-verification.test.js` and
`frontend/tests/guard-collection-verification.browser.mjs`.
New document: `frontend/docs/guard-collection-verification.md`.

Modified: `frontend/src/pages/GuardVerifyCollectionPage.jsx`,
`frontend/src/styles.css` (scoped import), `frontend/src/pages/DashboardPage.jsx`
(one Guard paragraph), `frontend/src/components/LoginStory.jsx` (text only),
`frontend/src/utils/loginPreview.js` (one text), `backend/src/utils/chatbot.js`
(collection instructions), `backend/tests/chatbot.test.js` (focused assertions),
`frontend/tests/parcel-room-collection-disputes.browser.mjs` (verification-session
POST/GET fixture and started-not-completed expectations; Resident QR owner fixture).
Earlier unrelated working-tree changes are preserved, not attributed to this step.

Guard integration and final targeted checks are complete. Review verdict is Ship;
the workflow is ready for manual two-device testing and handoff to Step 18D, not
a claim of production/device validation. The additional network-retry capture and
automated retry coverage have passed their respective bounded checks.
No Step 18D investigation, Parcel Trace, OCR or image comparison was implemented.
