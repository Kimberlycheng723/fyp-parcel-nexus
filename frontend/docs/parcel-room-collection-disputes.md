# Step 17D: Rooms in QR Collection and Disputes

## Scope

This is a read-only room integration, not a new collection verification or
investigation workflow. Existing QR eligibility, token generation, two-minute
expiry, single-use confirmation, status changes, notifications, evidence and
conversation remain unchanged. No migrations, dependency/environment changes,
data backfill or permanent test records were introduced.

Resident parcel selection already displays rooms through Step 17C; it is reused
without editing dashboards or duplicating selection. The existing QR page now
shows Parcel Room per selected parcel. Room labels use the shared
`parcelRoomLabel` helper, with `Not Assigned` for actual null assignments.

QR sessions already restore from sessionStorage. Room labels are refreshed via
the existing authenticated Resident parcel-detail API on mount/new collection,
return to the foreground, and an explicit refresh icon. The GET helper accepts
optional request options for AbortSignal; existing callers remain compatible.
Reads abort on unmount/new collection and overlapping foreground refreshes are
suppressed. Only label state changes: token, expiry, selection and stored session
are untouched. Failed reads display `Room information unavailable` plus a retry
message, never a misleading cached room or false `Not Assigned`. QR display and
collection remain usable during a room-read error.

The Guard's existing successful scan result displays each parcel's room. This
API already confirms collection immediately; no preview/confirmation step or
manual-entry workflow was invented. The Guard result uses room names from the
current database read in the original verification transaction, including room
changes since QR generation and inactive assignments. Results remain in the
existing vertically scrollable parcel list.

Both the shared Admin/Guard dispute modal and Resident detail page show the room
in their existing Related Parcel section. No reassignment control is added.
They use the existing detail fetch, so opening/reopening or refreshing reads the
current assignment. They do not promise background live room synchronization
while a detail is left open.

## API Change

The only production backend change is additive `parcel.parcel_room_name` in the
shared dispute SELECT/serializer. Both existing dispute joins use LEFT JOIN to
`parcel_rooms`, without `is_active` filtering. List/detail and existing mutation
responses preserve all other fields. No room ID is newly exposed by this change.

- Resident QR generation: POST `/api/resident/collections` unchanged.
- Resident room refresh: GET `/api/resident/parcels/:id`, existing unit scope.
- Guard scan/confirmation: POST `/api/guard/collections/verify` unchanged.
- Disputes: existing GET `/api/disputes` and GET `/api/disputes/:id` include room name.

Admin/Guard can read only their existing authorized dispute surface; Guard alone
can verify QR collections. Resident receives only owned parcel/dispute data and
never calls room-management endpoints. Super Admin remains outside disputes and
QR collection. Backend authorization stays authoritative.

## Validation

```sh
node --test frontend/tests/parcel-rooms.test.js frontend/tests/audit.test.js frontend/tests/chatbot.test.js frontend/tests/auth-validation.test.js frontend/tests/password-strength.test.js frontend/tests/login.test.js
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-room-collection-disputes.browser.mjs
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-room-integration.browser.mjs
docker compose exec -T backend env PARCEL_ROOM_INTEGRATION=true node --test tests/parcel-rooms.test.js tests/chatbot.test.js tests/password-reset-email.test.js
docker compose exec -T frontend npm run build --workspace frontend
node --check backend/src/services/dispute.service.js
node --check backend/tests/parcel-rooms.test.js
git diff --check
```

The Step 17D browser suite intercepts every API call/write and blocks sockets.
It runs the actual React UI and production ZXing decoder, using QR PNG pixels
from the existing QR component fed into a test-only canvas camera stream.
This is automated decoding coverage, not a physical camera or live collection.
It checks multi-room/null/inactive display, current labels after stale-session
restoration, refresh-error recovery without changing token/expiry, long names,
staff actions, read-only Resident details and unauthorized detail errors at
1440px/834px/390px. Denied-route checks run separately at 390px. Screenshots use
`/private/tmp/parcel-nexus-<name>-<width>.png`. Browser target defaults to
`http://localhost:5173`; `PARCEL_NEXUS_TEST_URL` overrides it.

The Step 17C browser suite is rerun for multi-parcel selection, QR generation
payload, staff/resident parcels and reassignment regressions. Its APIs are also
fixtures, not live database writes.

The backend suite uses real Express/JWT/PostgreSQL in a single outer rollback
transaction. New dispute tests use explicit fixture references so the production
dispute sequence is not advanced. They verify current/null/renamed/inactive room
names, own-account privacy, evidence metadata/privacy, review/resolution,
responses/notes, conversation, history, and blocked role transitions. QR tests
verify room reassignment after generation, subsequent room deactivation, mixed
rooms/null assignment, wrong-unit and wrong-role rejection, 120-second expiry
contract, collected status and token reuse rejection. All fixture records are
rolled back and table counts are asserted unchanged. Outbound mail/push are
disabled only for fixture recipients; no real external messages are sent.

Executed results: 32/32 frontend unit checks, 46/46 backend checks, the complete
Step 17D browser suite and Step 17C browser regression suite passed. The browser
checks cover 1440px/834px/390px with page-overflow assertions. Backend syntax
checks and `git diff --check` passed. The frontend production build passed with
the existing large-chunk warning. Early test assertions were corrected to use
the actual `new_status` history field, the renamed duplicate-room fixture, and
to permit the Resident's normal summary request after denied-route redirects.
These were test assumptions, not production behavior changes, and all fixtures
were rolled back even in the failed runs.

Manual checks still recommended: scan with physical Guard hardware, check live
Socket.IO completion and actual accounts across sessions. These integrations
were not redesigned, and fixtures do not establish physical-camera or external
delivery reliability. The existing production-build large-chunk warning remains.

## Files

New:

- `frontend/tests/parcel-room-collection-disputes.browser.mjs`
- `frontend/docs/parcel-room-collection-disputes.md`

Modified:

- `frontend/src/pages/ResidentCollectionPage.jsx`
- `frontend/src/pages/GuardVerifyCollectionPage.jsx`
- `frontend/src/pages/ResidentDisputeDetailPage.jsx`
- `frontend/src/components/StaffDisputeDetailModal.jsx`
- `frontend/src/services/api.js` (optional request options on Resident detail GET)
- `frontend/src/styles/parcel-collection.css`
- `frontend/src/styles/disputes.css` (new room label contrast only)
- `backend/src/services/dispute.service.js` (read-only additive room name)
- `backend/tests/parcel-rooms.test.js`
- `backend/docs/parcel-rooms.md`

All earlier uncommitted work is preserved. No Step 17E work has been started;
room-related Audit Trail presentation can be considered there with a separate
confirmed brief, using the existing backend room/assignment events.
