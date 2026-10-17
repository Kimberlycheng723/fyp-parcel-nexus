# Step 17A: Parcel Room Backend

## Migration and Existing Data

Run the normal backend workflow:

```sh
docker compose exec -T backend npm run db:migrate
```

Migration `014_parcel_room_management.sql` is additive and idempotent. It creates
`parcel_rooms` with a UUID `id`, normalized unique `name`, nullable `description`,
`is_active` (default true), and timestamps. Names are 1-100 characters; descriptions
are at most 1000 characters. API normalization trims/collapses whitespace; a unique
case-insensitive index and canonical-name check protect database writes too.
The existing `set_updated_at()` trigger function is reused.

`parcels.parcel_room_id` is a nullable UUID foreign key to `parcel_rooms.id`, with
`ON DELETE RESTRICT` and an index. Existing records are not assigned/backfilled.
No sample rooms, permanent deletions, data resets, new dependencies, or frontend
changes are included. The migration and the full chain have been run twice on
the current development database successfully.

## Room APIs

All routes require the existing Bearer authentication. Responses follow the
existing `{ message }` error convention. Super Admin and Resident get 403 on all
room-management routes; unauthenticated requests get 401.

| Method | Endpoint | Roles | Response |
| --- | --- | --- | --- |
| GET | `/api/parcel-rooms` | Admin, Guard | `{ parcel_rooms: [...] }`, active and inactive |
| GET | `/api/parcel-rooms/active` | Admin, Guard | `{ parcel_rooms: [...] }`, active only |
| GET | `/api/parcel-rooms/:id` | Admin, Guard | `{ parcel_room: {...} }` |
| POST | `/api/parcel-rooms` | Admin | 201, `{ parcel_room: {...} }` |
| PATCH | `/api/parcel-rooms/:id` | Admin | `{ parcel_room: {...} }` |
| PATCH | `/api/parcel-rooms/:id/status` | Admin | `{ parcel_room: {...} }` |

Room records contain exactly `id`, `name`, `description`, `is_active`, `created_at`,
and `updated_at`. Lists are ordered by case-insensitive name and ID, with no
pagination or unsupported query filters. There is no DELETE route.

POST accepts `{ "name": "Lobby Room", "description": "Near the lobby" }`.
PATCH accepts either or both `name` and `description`; `description: null` clears
it. Status PATCH accepts only `{ "is_active": false }` or true. Unknown fields,
invalid types/lengths/NUL characters, blank names, and malformed IDs return 400;
nonexistent rooms return 404 and duplicate names return 409. Deactivated names
remain reserved. No-op room updates do not create misleading audit entries.

## Parcel Integration

The existing Guard-only `POST /api/parcel-registration/sessions` stays Guard-only.
Every item in `parcels` must now explicitly supply an active room UUID:

```json
{
  "courier_id": "<existing-active-courier-uuid>",
  "delivery_person_contact": "0123456789",
  "parcels": [
    {
      "unit_id": "<existing-unit-uuid>",
      "tracking_number": "TRACK-1",
      "parcel_room_id": "<active-room-uuid>"
    }
  ]
}
```

Items in one batch may use different rooms. Missing/invalid/inactive rooms fail
validation, unknown rooms return 404, and the whole batch rolls back on failure.
Existing courier, unit, tracking, status, deadline, and arrival-notification rules
are preserved. Room rows are locked in a consistent order with `FOR SHARE` until
commit, preventing concurrent deactivation during assignment.

Admin/Guard use the existing `PATCH /api/parcels/:parcelId` to reassign:

```json
{ "parcel_room_id": "<active-destination-room-uuid>" }
```

The parcel is row-locked before reading its current values, so room-only edits
preserve unrelated fields and the audit captures the actual previous room.
Omitting `parcel_room_id` preserves the assignment (including NULL or inactive).
Explicit NULL/unassignment is not supported; reassignment must choose an active
room. Existing parcel-edit validation still applies. No status or collection
authorization changes are introduced.

Registration results, staff parcel lists/details, and resident lists/details add
`parcel_room_id` and `parcel_room_name` without removing existing fields. Both
fields are null for unassigned legacy records. Room renames are reflected through
joins, and inactive room names remain readable on existing assignments.

`GET /api/parcels`, its existing export filter path, and
`GET /api/resident/parcels` accept an optional UUID `parcel_room_id` filter,
combined with existing search/status/tab/pagination filters. A valid unknown room
returns no matching parcels, not another unit's data. Resident ownership remains
enforced through the authenticated account's unit on both list and detail APIs.

Step 17C adds the exact sentinel `parcel_room_id=unassigned` to the existing
**staff** list/export filter only. It selects `IS NULL` at the database query
layer, combined with search/status/date/pagination. UUID filters are unchanged;
other malformed values still return 400. This is a read-only extension, not an
unassignment payload or a Resident management permission. No migration is needed.

## QR, Chatbot, and Audit

Step 17E adds the registration-time room name to the existing centralized arrival
message. Email and in-app already use that persisted message; arrival Browser
Push now uses it too instead of the old generic body. Other push categories stay
generic. No notification type, preference, delivery adapter, recipient query,
read/unread field or deduplication key changes. Missing room names retain the
old arrival wording. Reassignment still creates only the existing transactional
audit events, not another arrival notification. Existing history is not rewritten.

Step 17D adds `parcel.parcel_room_name` to the existing dispute list/detail and
mutation responses that use the shared dispute serializer. The room name comes
from a LEFT JOIN to the related parcel's current assignment, without an active
room predicate. Reassignment/renaming therefore appears on the next detail read;
inactive rooms remain named, and legacy null assignments return null. No room
UUID, new endpoint, database migration, workflow, permission or notification
change is added to disputes. Existing QR responses already included room names,
so Step 17D makes no production collection-backend changes.

The existing `/api/resident/collections` and `/api/guard/collections/verify` APIs
include room ID/name per parcel. The single QR still supports mixed rooms, NULL
assignments and inactive historical rooms. Token hashing, two-minute lifetime,
unit ownership, status checks, one-use enforcement and Socket.IO completion
payloads are unchanged.

The chatbot's existing read-only, resident-scoped tools now include room names,
not room UUIDs. No new tool or management access is added. NULL assignments are
reported honestly; shelves still are not recorded.

The centralized audit service adds these readable actions:

- Parcel Room Created
- Parcel Room Updated
- Parcel Room Activated
- Parcel Room Deactivated
- Parcel Room Assignment Changed

Room configuration events are Admin-visible only. Assignment changes are also
Guard-visible operational events and store the parcel identifier, before/after
room IDs/names, actor and timestamp. Initial assignments are included in the
existing Parcel Registered metadata. The existing Parcel Edited event remains
alongside the dedicated reassignment event. All room writes and assignment audit
entries commit in the same business transaction; failures roll back rather than
leave a changed room without its audit. No second audit system is introduced.

## Validation

```sh
docker compose exec -T backend env PARCEL_ROOM_INTEGRATION=true node --test tests/parcel-rooms.test.js tests/chatbot.test.js tests/password-reset-email.test.js
```

The integration suite exercises real Express routes, JWT middleware and PostgreSQL
with fixtures inside a single outer transaction. Business transactions use test
savepoints; final rollback removes every fixture. Outbound email and Browser Push
are disabled only for the fixture accounts. No actual email, push or Gemini calls
are made by the tests. The full run passes 45 tests, including 10 HTTP/database
scenarios, chatbot regressions and email MIME regressions.

Initial test failures were fixture assumptions (batch order and a guessed QR URL);
those were corrected to the existing contracts and the full suite reran green.
Syntax checks and `git diff --check` are also required for final delivery.

Final validation passed all 17 touched backend JavaScript syntax checks and
`git diff --check`. The running backend health endpoint returned 200 and an
unauthenticated live room-list request returned 401. Existing counts remained
48 parcels, 13 collections, 44 audit entries, and 5 enabled Browser Push
preferences. The room table is empty, and all 48 legacy parcels remain unassigned.
No frontend build was run because this step changed no frontend files.

## Files Changed in Step 17A

New files (all under `backend/`):

- `src/db/migrations/014_parcel_room_management.sql`
- `src/services/parcelRoom.service.js`
- `src/controllers/parcelRoom.controller.js`
- `src/routes/parcelRoom.routes.js`
- `src/utils/parcelRoomValidation.js`
- `tests/parcel-rooms.test.js`
- `docs/parcel-rooms.md`

Modified files (all under `backend/`):

- `src/app.js`
- `src/controllers/parcel.controller.js`
- `src/controllers/parcelRegistration.controller.js`
- `src/controllers/residentParcel.controller.js`
- `src/services/parcel.service.js`
- `src/services/parcelRegistration.service.js`
- `src/services/residentParcel.service.js`
- `src/services/parcelCollection.service.js`
- `src/services/audit.service.js`
- `src/services/chatbotParcel.service.js`
- `src/utils/chatbot.js`
- `tests/chatbot.test.js`
- `docs/chatbot.md`

Earlier uncommitted frontend, email-template, asset and test changes were
preserved; they are not Step 17A changes. No environment file, dependency or
previous migration was edited.

## Step 17B Handoff

Backend integration is ready. Admin must create at least one room before new
registration can succeed. The unchanged Guard registration UI does not yet send
`parcel_room_id` and therefore cannot register new parcels until Step 17B adds
the required selector. No hidden fallback/default room is provided.

Step 17B should add Admin room management, active-room selection during Guard
registration, room display/reassignment in existing parcel views, and room
filters. Historical inactive assignments and NULL legacy rooms need explicit
display states; never offer inactive rooms as new destinations. Existing parcel
views/collection remain readable during this backend-only step.
