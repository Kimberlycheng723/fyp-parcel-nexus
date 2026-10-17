# Step 17B: Parcel Room Frontend

## Scope

One Admin-only `/parcel-rooms` page uses the existing protected route, sidebar,
API client, typography, buttons, status badges, and toast styling. Guard,
Resident, Super Admin, and unauthenticated users cannot open the management page.
The backend remains authoritative on every API call.

The page supports room creation/editing, active/inactive status, confirmation
before deactivation, local room-name search and status filtering, list refresh,
loading, empty/no-match/error states, and backend permission failures. Native
dialogs provide modal focus behavior, Escape, disabled controls while saving,
inline validation, and duplicate-submit prevention. There is no Delete action.

The existing Guard registration page now loads active rooms and requires an
explicit room per parcel. Each staged parcel retains its own room ID/name, even
when the next parcel uses another room. Staged room selectors allow correction
without discarding parcel photos or tracking/unit data. Room loading/failure/no
active rooms disable addition and final submission; refreshing active rooms
invalidates unavailable assignments. Backend rejection preserves the batch and
refreshes room choices so the Guard can correct and retry it.

## APIs

All requests reuse the existing `/api` client and Bearer token handling; no new
socket, authentication mechanism, backend route, environment variable, migration,
or dependency was introduced.

| Operation | Existing API | Contract |
| --- | --- | --- |
| Room list | GET `/api/parcel-rooms` | `parcel_rooms` array |
| Guard choices | GET `/api/parcel-rooms/active` | Active `parcel_rooms` array |
| Create | POST `/api/parcel-rooms` | `{ name, description }`; `parcel_room` response |
| Edit | PATCH `/api/parcel-rooms/:id` | `{ name, description }`; same room ID |
| Status | PATCH `/api/parcel-rooms/:id/status` | `{ is_active: boolean }` |
| Registration | POST `/api/parcel-registration/sessions` | Existing body plus `parcel_room_id` per parcel |

The list already contains all editable fields, so no redundant detail request is
needed to prepopulate the editor. Search/status filters stay client-side because
the current list API returns all rooms and supports neither parameter. Successful
writes update from the returned record and reload the list without clearing the
user's search/filter selections. Whitespace normalization and the 100/1000
character limits match the backend; blank descriptions are sent as null.

401 handling remains the shared session-expiry flow. A 403 read/write prevents
further management controls and displays the backend permission message. Other
request failures retain existing state and offer retry or correction.

## Files

New files under `frontend/`:

- `src/pages/ParcelRoomsPage.jsx`
- `src/components/ParcelRoomDialog.jsx`
- `src/styles/parcel-rooms.css`
- `src/utils/parcelRooms.js`
- `tests/parcel-rooms.test.js`
- `tests/parcel-rooms.browser.mjs`
- `docs/parcel-rooms.md`

Modified files under `frontend/`:

- `src/App.jsx`
- `src/components/ProtectedLayout.jsx`
- `src/services/api.js`
- `src/pages/ParcelRegistrationPage.jsx`
- `src/styles/parcel-registration.css`

All prior uncommitted work is preserved. No backend/database/environment file was
modified during Step 17B. Parcel Management, QR collection, notifications,
chatbot, disputes, and dashboards were not redesigned or edited.

## Validation Commands

```sh
node --test frontend/tests/parcel-rooms.test.js frontend/tests/audit.test.js frontend/tests/chatbot.test.js frontend/tests/auth-validation.test.js frontend/tests/password-strength.test.js frontend/tests/login.test.js
docker compose exec -T frontend npm run build --workspace frontend
git diff --check
```

For browser QA, use an existing Playwright installation, without installing a
production dependency:

```sh
PLAYWRIGHT_MODULE=<existing-playwright-module-path> node frontend/tests/parcel-rooms.browser.mjs
```

The browser suite intercepts all API writes and blocks socket connections. It
tests the real React UI with isolated fixture responses, not live mutations or
fake permanent database records. The Step 17A backend contract is unchanged.

Coverage includes Admin CRUD/status/duplicate errors, deactivation cancellation,
authentication headers, denied-role redirects, 401/403/500 states, empty/no-match
states, filtering, per-parcel active-room IDs, mixed-room batches, photo upload,
room loading/retry, stale-room correction, native dialog keyboard behavior, and
maximum-length room names. Desktop/tablet retain the table; mobile uses stacked
labelled table rows. Captures cover 1440px, 834px, and 390px with overflow checks.

The production build has the existing large-bundle warning. No unrelated bundle
refactor was performed. Live camera/scanner hardware, live email/push delivery,
and live database mutations are not exercised by frontend fixture tests.

Final executed results: 30/30 unit checks passed, the complete browser suite
passed at 1440px/834px/390px, the production build passed, and `git diff --check`
passed. Short 1440x500 and 834x500 dialog tests also confirmed that an enlarged
textarea can scroll to its footer actions. A shared Accounts CSS override found
in review was corrected with a room-dialog-specific selector; Accounts styles
were not changed. Initial browser fixture issues involved courier accessible
name matching and waiting for the native dialog to open before keyboard actions;
both were corrected and the full suite reran successfully.

## Manual Smoke Test

1. Sign in as Admin and open Parcel Rooms in the System sidebar group.
2. Create a real room with a name/optional description. Try a casing/spacing
   duplicate and confirm the error. Rename the room and clear its description.
3. Cancel a deactivation once, then confirm it. Verify the inactive badge and
   status filter. Activate the room again and test search/no-match/reset states.
4. Sign in as Guard. Confirm Parcel Rooms is absent and direct `/parcel-rooms`
   redirects to the normal landing page. Open Log New Parcel.
5. Pick courier/contact, unit, tracking and an active room. Add two parcels with
   different rooms and optionally a photo. Check both staged assignments, then
   finish once. Verify the real parcel records show the submitted room IDs.
6. Deactivate a selected room in another Admin session before submitting a Guard
   batch. Confirm the backend rejection preserves the batch, refreshes active
   choices, and allows selecting another active room before retry.
7. Repeat denied-page checks as Resident and Super Admin, and inspect the page
   and dialogs on tablet/mobile. Existing assignments must not be removed when
   rooms are deactivated.

Create rooms only as genuine configuration for manual testing; the automated
suite does not seed sample rooms. An Admin must create at least one active room
before new Guard registration can succeed.

## Step 17C

Remaining room integration can cover room display, active-room reassignment, and
room filters in the existing staff/resident parcel views. Those unrelated parcel
management/view changes are intentionally not included in Step 17B. No Step 17C
feature has been started.
