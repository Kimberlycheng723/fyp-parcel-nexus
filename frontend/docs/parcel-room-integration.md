# Step 17C: Parcel Room Integration

## Implemented

The shared Admin/Guard `/parcels` page displays backend room names in the desktop
table and responsive cards. Null legacy assignments display `Not Assigned`.
Inactive historical assignments keep their names. The room filter loads the
existing all-rooms API (including inactive rooms), combines with existing
search/status/date filters, resets to page 1, and is applied by the backend to
the full result set. Admin export includes the same room filter.

The existing parcel editor displays the current assignment and loads active
destination rooms. `Keep current assignment` preserves null/inactive assignments
and omits the room field. Only changed fields are submitted; room-only saves
send `{ parcel_room_id }` to the existing PATCH API. No status/collection field
is sent. Duplicate saves are blocked. A rejected stale selection keeps the
editor open, leaves the original assignment unchanged, and reloads active rooms.
Room errors have retry, and unrelated edits remain possible when no active rooms
exist. Backend validation and transactional audit logging remain authoritative.

Resident My Parcels is embedded in `DashboardPage.jsx`; changes are limited to
its parcel list and detail interaction, not analytics or other role dashboards.
Room names appear under the courier on desktop and in mobile parcel rows. The
tracking-number button loads the existing unit-scoped Resident detail API.
The extracted shared `ParcelDetailsDialog` handles staff nested fields and
Resident flat fields, preserves photo display, and shows the room. Resident
details have no editing/management controls or staff contact fields. Dates in
the dialog use Malaysia time. Native dialog focus, Escape and focus restoration
are used. Existing QR selection/generation is unchanged.

## API Contract

- GET `/api/parcel-rooms`: Admin/Guard filter options, active and inactive.
- GET `/api/parcel-rooms/active`: editor destinations only.
- GET `/api/parcels`: existing list plus `parcel_room_id=<UUID>` or `unassigned`.
- GET `/api/parcels/export`: same room filter; existing Admin-only export.
- GET `/api/parcels/:id`: staff detail.
- PATCH `/api/parcels/:id`: existing authorized Admin/Guard editor.
- GET `/api/resident/parcels`: existing authenticated unit-scoped list.
- GET `/api/resident/parcels/:id`: Resident read-only detail.

The one backend gap was the required `Not Assigned` filter. Step 17A accepted
only UUIDs. A minimal extension to the existing staff list/export query adds
`parcel_room_id=unassigned` using `IS NULL`. No new endpoint, migration, backfill,
room deletion, environment change, dependency, or role permission was added.
The sentinel is not accepted as a parcel reassignment or Resident room filter.
Parcel responses provide `parcel_room_name` for display and `parcel_room_id` for
assignment/filtering. Clearing an assignment is unsupported; keeping the current
assignment omits `parcel_room_id` rather than sending null.

## Responsive Layout

At 1440px the staff table keeps every existing column and adds Parcel Room with
wrapping room names. At narrower widths (up to 1100px), the existing labelled
parcel cards are reused rather than squeezing seven columns or overflowing the
page. Tablet pagination stays in one row; mobile stacks its controls. Resident
table structure stays unchanged, with room names below courier names; existing
mobile rows adapt at 760px and below. Room selectors have accessible labels.

## Verification

```sh
node --test frontend/tests/parcel-rooms.test.js frontend/tests/audit.test.js frontend/tests/chatbot.test.js frontend/tests/auth-validation.test.js frontend/tests/password-strength.test.js frontend/tests/login.test.js
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-room-integration.browser.mjs
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-rooms.browser.mjs
docker compose exec -T backend env PARCEL_ROOM_INTEGRATION=true node --test tests/parcel-rooms.test.js tests/chatbot.test.js tests/password-reset-email.test.js
docker compose exec -T frontend npm run build --workspace frontend
node --check backend/src/services/parcel.service.js
node --check backend/tests/parcel-rooms.test.js
git diff --check
```

Browser tests intercept every API write and block sockets, using isolated
fixtures at 1440px/834px/390px. They check staff/resident room display, historical
rooms, null assignments, filtered pagination, room-only payloads, stale-room
recovery, other edits preserving assignments, combined filters/export, Resident
read-only details/404, unchanged QR selection payload, denied roles, room load
retry, no-active-room preservation, and maximum-length names. Step 17B browser
regressions cover room management and registration again. These are not live
browser-to-database mutations.
The optional `PARCEL_NEXUS_TEST_URL` override selects the existing dev server
(default `http://localhost:5173`). Screenshots are written to
`/private/tmp/parcel-nexus-<name>-<width>.png`.

The backend suite uses real Express/JWT/PostgreSQL within an outer transaction
that rolls back all fixtures. It verifies reassignment audits, unit ownership,
registration, mixed-room multi-parcel QR collection, and the new unassigned
filter/pagination/export. It asserts database counts are unchanged after cleanup.
No permanent test records or external messages are created.

Manual verification should use genuine configured rooms: assign a legacy parcel,
check its room as Resident, then deactivate the room and confirm historical
display/filtering plus reassignment to an active room. Cross-session timing and
real notification delivery are not exercised by the intercepted browser suite.
No Step 17D work was started; its scope should be confirmed separately.

Executed results: 32/32 frontend unit checks, 45/45 backend checks, the complete
Step 17C browser suite and existing Step 17B browser suite passed. Responsive
checks ran at 1440px, 834px and 390px, including maximum-length room names and
no page-level horizontal overflow. The production build passed with only the
pre-existing large-chunk warning. Both touched backend JavaScript syntax checks
and `git diff --check` passed. The existing Vite server serves `/parcels` (HTTP
200). Early browser assertions needed to respect uppercase labels and wait for
refreshed rows; screenshot captures were also settled past entrance animations.
Those test/capture corrections were rerun successfully.
Final review also corrected the contrast of current-room text and added a
preserve-current action during room-loading errors. The browser suite tests
recovery after selecting a destination and a failed refresh without losing other
field edits.

## Step 17C Files

New:

- `frontend/src/components/ParcelDetailsDialog.jsx`
- `frontend/tests/parcel-room-integration.browser.mjs`
- `frontend/docs/parcel-room-integration.md`

Modified:

- `frontend/src/pages/ParcelManagementPage.jsx`
- `frontend/src/pages/DashboardPage.jsx` (Resident parcel section only)
- `frontend/src/styles/parcel-management.css`
- `frontend/src/styles/dashboard.css` (Resident parcel styles only)
- `frontend/src/utils/parcelRooms.js`
- `frontend/tests/parcel-rooms.test.js`
- `backend/src/services/parcel.service.js` (unassigned read filter only)
- `backend/tests/parcel-rooms.test.js`
- `backend/docs/parcel-rooms.md`

All earlier uncommitted changes are preserved; the above lists are specific to
this step, not the entire working tree.
