# Step 17E: Rooms in Notifications and Audit Trail

## Notifications

Registration passes the validated, locked room's name to the existing
`persistParcelArrivalNotification` service. Arrival wording now reads:
`Your [courier] parcel ([tracking]) is ready for collection at [room].`
Missing/null/blank room names retain the original `ready for collection.` message.
No room UUID is added to notification text or payload fields.

The centralized persisted message is used by in-app history, the existing
Socket.IO foreground event/toast and the existing email adapter. HTML email
continues to escape the entire message. JSON push payloads remain plain text;
only PARCEL_ARRIVAL now uses the persisted message. Overdue, dispute and community
push wording remains generic. Arrival pushes therefore include courier/tracking
and room on the notification surface; these may be visible on the device lock
screen depending on OS settings when Browser Push is enabled. This is the requested arrival-information expansion,
not a new preference or category.

Recipient unit/Resident scoping, preference flags, transaction boundaries,
after-commit delivery, read/unread behavior, deduplication keys and failure
isolation are unchanged. No old notification is rewritten. A room rename or
parcel reassignment does not update the historical arrival message. Existing
parcel PATCH does not send a parcel-update notification, so reassignment does
not send another arrival. A dedicated update message can be considered in a
future separately confirmed requirement, not implemented here.

## Audit Presentation

The existing frontend details dialog now displays recorded room metadata:

- Room creation: Room and Availability.
- Room editing: recorded name/description before and after.
- Activation/deactivation: recorded availability before and after.
- Assignment: Tracking Number, Previous Room and New Room.
- Parcel Edited/Registered: recorded room change/name where present.

Exact emitted action labels remain `Parcel Room Created`, `Parcel Room Updated`,
`Parcel Room Activated`, `Parcel Room Deactivated` and
`Parcel Room Assignment Changed`. These already exist in role-aware backend
`filter_options`; the frontend's existing dynamic multi-select needs no new list.
Guard still sees assignment activity, not Admin-only room configuration. Admin
still exports through the existing server CSV endpoint with current filters.

No audit write was added. Actor, timestamp/Malaysia formatting, search/date/role
and multi-action filters, pagination/reset, CSV implementation and permissions
are preserved. Room configuration uses the existing Building2 icon instead of
the unrelated login icon. Other action display stays unchanged.

The metadata renderer remains an allowlist, not a raw JSON dump. Generic
`name`/`description`/availability fields are interpreted only for PARCEL_ROOM
configuration. Room identifiers are not added as detail values; configuration
Record ID is hidden. Historical UUID-only references/descriptions are redacted
in the UI, and missing historical names read `Room name not recorded`. True
recorded null assignments read `Not Assigned`. No current room lookup is used
to guess historical names. Other entity identifiers keep existing behavior.
Stored audit rows/API payloads and the existing CSV representation are unchanged.

## Validation

```sh
docker compose exec -T backend env PARCEL_ROOM_INTEGRATION=true node --test tests/parcel-rooms.test.js tests/parcel-room-notifications.test.js tests/chatbot.test.js tests/password-reset-email.test.js
node --test frontend/tests/parcel-rooms.test.js frontend/tests/audit.test.js frontend/tests/chatbot.test.js frontend/tests/auth-validation.test.js frontend/tests/password-strength.test.js frontend/tests/login.test.js
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-room-notifications-audit.browser.mjs
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-rooms.browser.mjs
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-room-collection-disputes.browser.mjs
docker compose exec -T frontend npm run build --workspace frontend
git diff --check
```

Backend channel tests mock the database, SMTP transport and web-push transport.
They assemble real email MIME using Nodemailer's stream transport and exercise
the actual centralized channel adapters. Private-room emission is asserted
through a mocked `io.to(...).emit`, not an actual socket client or live foreground
delivery.
They verify safe HTML/text/JSON, legacy wording, multiple rooms, preferences,
deduplication, recipient lookup, unchanged generic push categories and delivery
failure preserving history. No real email or push is sent.

The existing integration suite uses real Express/JWT/PostgreSQL with fixtures
inside an outer rollback transaction. Registration messages are checked against
their actual assigned rooms and are unit-scoped/unread. Subsequent reassignment
must leave the initial notification rows unchanged. Room audit filters, Malaysia
date, repeated actions, pagination, role options, permissions and filtered CSV
are tested. Historical metadata is checked after a room rename. Existing room,
registration, parcel editing, QR and dispute workflow checks run again. Fixture
records are rolled back and counts asserted unchanged; no permanent data is added.

Frontend units verify safe recorded-name presentation and missing-name fallbacks.
Browser tests intercept all APIs, block sockets and exercise the real React UI
at 1440px/834px/390px: all five room actions, assignment and historical details,
dynamic filters/search/date/role/reset/pagination, Admin filtered CSV download,
Guard export hiding, notification literal text and read/unread states, long names
and page-overflow checks. Error/retry and denied-role checks run separately at
390px. Screenshot paths are `/private/tmp/parcel-nexus-<name>-<width>.png`, with
viewport crops for assignment dialogs. `PARCEL_NEXUS_TEST_URL` defaults to
`http://localhost:5173`; no production dependency is installed for testing.

Executed results: 35/35 frontend units, 48/48 backend checks, the complete Step
17E browser suite at all three widths, Step 17B management/registration and Step
17D QR/dispute browser regressions passed. The production build passed with the
existing large-chunk warning; all five touched backend JavaScript syntax checks
and `git diff --check` passed. These runs were executed by the implementation
agent, not independently rerun by the read-only final reviewers. An early test
syntax failure from a duplicate local variable was corrected before the complete
backend suite was rerun successfully.

Physical devices, live SMTP/push delivery and foreground browser socket delivery
remain manual checks. Mocked channel tests do not establish real delivery timing.
Room names are snapshots in arrival history and historical audits, intentionally
not live links to renamed/reassigned rooms. Old ID-only audit names cannot be
reconstructed reliably. The existing large production-chunk warning remains.

## Files

New:

- `backend/tests/parcel-room-notifications.test.js`
- `frontend/tests/parcel-room-notifications-audit.browser.mjs`
- `frontend/docs/parcel-room-notifications-audit.md`

Modified:

- `backend/src/services/notification.service.js`
- `backend/src/services/parcelRegistration.service.js`
- `backend/src/services/webPush.service.js`
- `backend/tests/parcel-rooms.test.js`
- `backend/docs/parcel-rooms.md`
- `frontend/src/pages/AuditTrailPage.jsx`
- `frontend/src/utils/audit.js`
- `frontend/tests/audit.test.js`

No migration, environment, dependency, service-worker, notification frontend,
dashboard, report, chatbot, QR or dispute production file was modified in this
step. Earlier uncommitted work is preserved. Step 17F was not started; its scope
needs a separate brief. No barcode verification, collection evidence or
investigation module was added.
