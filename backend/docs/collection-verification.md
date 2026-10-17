# Step 18A: Resident-Verified Collection Backend

This is the historical backend-foundation handoff. Resident/Guard UI integration
was completed in Steps 18B/18C; [Step 18F](feature18-integration.md) records the
current live tests and authenticated registration-photo remediation.

## Scope and Compatibility Change

This is backend-only. The existing QR generation endpoint, hashed token,
two-minute QR lifetime, selected-item associations, and historical collections
are reused. No second QR system or duplicate completed collection is created.

**POST `/api/guard/collections/verify` no longer collects parcels.** It initiates
verification and returns `verification_session`. The previous immediate completion
implementation has been removed, not retained as an optional legacy path.
All new collections, including old ACTIVE QR requests scanned after deployment,
must use Resident verification. Existing USED history stays readable without
requiring retroactive evidence.

The unchanged Guard/Resident collection frontend still assumes immediate Guard
completion and has no barcode/photo/Resident-confirm controls. It is intentionally
not a usable end-to-end collection interface until Step 18B/18C integrates these
APIs. Its existing "collected" labels must not be treated as backend completion.
Do not re-enable the old completion endpoint to compensate for that UI gap.
Existing chatbot/general QR guidance also still describes the former Guard-finalized
flow. Its wording needs a coordinated update with that frontend integration;
chatbot code, tools and provider settings were not changed in Step 18A.

The existing parcel status PATCH already rejects setting COLLECTED directly.
The generic parcel editor does not write status/collected_at. The only application
code that now sets COLLECTED is `confirmCollectionVerification`, which requires
the authenticated owning Resident. No unrelated parcel-management edits were made.

## Migration and Schema

New migration: `015_resident_collection_verification.sql`.
The normal full runner was executed twice successfully, including migrations
001-015; no earlier migration was edited. No seed/backfill, data reset, historical
evidence requirement, environment change or dependency installation was added.

```sh
docker compose exec -T backend npm run db:migrate
```

- `parcel_collections.collection_status` adds VERIFYING. Existing ACTIVE, USED,
  EXPIRED and CANCELLED values and records remain valid.
- `collection_verification_sessions`: UUID session, unique existing collection
  reference, immutable Resident/unit/unit-label/Guard identity snapshots, status,
  creation/expiry and confirmation/completion/cancellation timestamps.
- `collection_verification_evidence`: one row per session/parcel; immutable
  tracking/courier/room snapshots, current scanned value/result, bounded attempt
  count, verification time, one current photo reference/MIME/size/SHA-256/upload
  time. Registration-photo fields are not overwritten.
- `collection_barcode_attempts`: append-only attempted values/results and actor
  references. An index on case-insensitive scanned tracking supports later
  investigation across units; no investigation search API is provided now.
- `collection_verification_reservations`: one active session per parcel, enforced
  by a primary key. Composite FK ties each reservation to its evidence row.

Session/evidence FKs restrict destructive history deletion. Indexes cover
Resident, Guard, expiry, parcel evidence, attempts and reservation release.
Database triggers protect immutable identity snapshots and closed evidence,
and prohibit rewriting/deleting barcode attempts. New tables are empty after
test cleanup; old collections have no forced new session/evidence records.

## Lifecycle and Transactions

1. Resident generates the existing QR from own pending selected parcels.
2. Guard scans while QR is valid. Server derives Resident, unit and exact parcel
   IDs from existing records, validates eligibility and creates one linked
   AWAITING_VERIFICATION session. Existing collection becomes VERIFYING.
   Parcels remain PENDING_COLLECTION, with collected_at unset.
3. Resident records per-parcel barcodes and photos, in either order, with retries
   and photo replacement allowed while active.
4. Resident explicitly confirms. All selected parcels must pass every check.
   One transaction sets parcels COLLECTED, existing collection USED and session
   COMPLETED, with the Resident as confirmer and original Guard preserved.
5. Resident may cancel an active session. CANCELLED/EXPIRED release reservations,
   retain evidence/attempts, and require a fresh QR/session to try again.

Policy chosen for this foundation: verification expires **15 minutes after the
Guard scan**, independently of the original two-minute QR lifetime. There is no
extension endpoint. Expiry is enforced on API access/mutations, with database-clock
rechecks after relevant lock waits and before finalization. A startup/60-second
backend sweep also expires idle sessions. Expiry creates one System audit event;
subsequent requests do not repeat it.

Same initiating Guard scanning a VERIFYING QR returns the same session, even if
the original QR time has elapsed: this is retrieval, not a new authorization.
Other Guards cannot take it over. USED/CANCELLED/EXPIRED QR requests are rejected.
Overlapping active sessions cannot reserve the same parcel. Generating another
QR is still allowed, but starting it fails until the prior reservation ends.

A shared PostgreSQL transaction advisory lock orders verification operations
across backend processes. Parcel rows are additionally locked in ID order to
coordinate with existing edits/QR generation. This conservative design targets
the current low-volume condominium workflow; it serializes verification work,
including photo validation at completion, rather than claiming high throughput.

Confirmation rechecks owner/current unit, session/collection state, expiry,
exact collection membership, reservations, pending/non-deleted status, tracking
snapshot equality, every barcode match and every stored photo's bytes/hash/size.
Changed tracking/unit/status or missing/tampered photos cause an error without
partial collection. Audit writes are in the same transaction; an audit failure
rolls back collection state. External real-time delivery occurs after commit and
cannot undo success.

Repeated confirmation returns 200 with `already_completed: true` and the closed
session, without another collection, audit or real-time event. Repeated cancellation
is also idempotent. A byte-identical photo upload or identical current barcode
submission creates no extra audit/attempt row.

## API Contract

All endpoints reuse existing Bearer JWT authentication and role middleware.
Errors use `{ "message": "..." }`. Invalid input is 400; forbidden role 403;
foreign/nonexistent session or parcel 404; inactive/conflicting/incomplete state
409; expired verification 410; rate/attempt limits 429.

| Method | Endpoint | Access / Purpose |
| --- | --- | --- |
| POST | `/api/resident/collections` | Existing Resident QR generation, unchanged |
| POST | `/api/guard/collections/verify` | Guard; `{ token }`; start/retrieve own initiated session |
| GET | `/api/resident/collection-verifications/active` | Resident; own active sessions array |
| GET | `/api/collection-verifications/:sessionId` | Owning Resident/current unit, initiating Guard, or Admin |
| POST | `/api/collection-verifications/:sessionId/parcels/:parcelId/barcode` | Owning Resident; submit barcode/unreadable result |
| PUT | `/api/collection-verifications/:sessionId/parcels/:parcelId/photo` | Owning Resident; multipart single `photo` file |
| GET | `/api/collection-verifications/:sessionId/parcels/:parcelId/photo` | Owning Resident/current unit, initiating Guard, or Admin |
| POST | `/api/collection-verifications/:sessionId/confirm` | Owning Resident only; empty JSON object |
| POST | `/api/collection-verifications/:sessionId/cancel` | Owning Resident only; empty JSON object |

Super Admin has no verification/evidence access. Guards cannot confirm, cancel,
submit Resident barcode results or upload Resident collection photos. Admin can
read but cannot finalize or replace evidence. No cross-unit search is exposed.

Start/detail/mutation response shape:

```json
{
  "verification_session": {
    "session_id": "<uuid>",
    "collection_id": "<existing-collection-uuid>",
    "status": "AWAITING_VERIFICATION",
    "unit_reference": "A-10-01",
    "guard_id": "<authenticated-guard-uuid>",
    "created_at": "<timestamp>",
    "expires_at": "<timestamp>",
    "confirmed_at": null,
    "completed_at": null,
    "cancelled_at": null,
    "parcel_count": 1,
    "parcels": [{
      "evidence_id": "<uuid>",
      "parcel_id": "<uuid>",
      "registered_tracking_number": "SPX123",
      "courier_name": "Shopee Express",
      "parcel_room_name": "Lobby Room",
      "scanned_tracking_number": null,
      "barcode_status": "PENDING",
      "attempt_count": 0,
      "verified_at": null,
      "photo_uploaded_at": null,
      "photo_present": false,
      "photo_url": null
    }]
  }
}
```

Active lookup returns `{ verification_sessions: [...] }`. Photo URLs are protected
API routes, not public storage URLs: future frontend must fetch with Bearer auth
and display a Blob URL. Successful confirmation additionally returns `collection`
with confirmed_by, verified_by, collected_at, parcel_count and parcel results.
Raw QR hashes, stored filenames, photo digests and private filesystem paths are
not exposed by session JSON.

## Barcodes

Payload is exactly `{ "scanned_tracking_number": "SPX123" }`, or
`{ "unreadable": true }`. Nonempty printable text is bounded to 120 characters.
Leading/trailing whitespace is trimmed; comparison is case-insensitive, matching
existing registration uniqueness conventions. Meaningful punctuation/internal
spaces are not removed. Current active database tracking numbers were checked
read-only: the longest was 17 characters. Longer future registration values
would require a separately agreed input-limit adjustment.

The server compares only to this parcel's immutable session tracking snapshot.
Result is MATCHED, MISMATCHED or UNREADABLE; mismatch returns 200 with an explicit
failed `barcode_result`, not collection success. Only MATCHED can confirm.
It does not query who owns an incorrectly scanned tracking number, so foreign
unit/Resident details are not revealed. Different attempts are retained, including
failures before a later match; identical current submissions are deduplicated.
Each parcel/session accepts at most 30 distinct state-changing attempts.

Mutation/Guard-start routes share a process-local 60-request/minute/user limiter
with bounded memory, following the existing limiter style. The persistent scan
cap and database locking remain cross-process protections. A multi-instance
deployment would need a shared gateway rate limit; none is introduced here.

## Private Photo Storage

Collection photos live under backend `private-uploads/collections`, outside the
public `/uploads/parcels` mount, with generated UUID `.jpg`/`.png` filenames.
The directory/files use restrictive permissions and are ignored by Git.
Original client filenames/URLs/paths are never trusted for association.
Multer uses bounded memory, one JPG/JPEG/PNG file of at most 5 MB and no form
fields; association is performed only after active Resident/session/parcel checks.

Content checks include MIME/signature agreement, PNG complete chunks/CRC/zlib
stream/filter-row structure, JPEG bounded marker/frame/scan/end structure using
the existing PDFKit frame parser, and a 16-million-pixel cap. PNG inflation is
also bounded to 64 MiB. This is structural image validation, not malware scanning,
proof of camera capture, or full JPEG entropy/pixel decoding. No new imaging
dependency/provider or AI comparison service was added.

One evidence row has one current photo. Replacement commits the new association
before removing the old private file. Failed associations remove the new file;
identical bytes reuse the existing association. Completed/expired/cancelled
evidence cannot be replaced. Confirmation revalidates stored bytes and SHA-256.
Registration photos remain separate and unchanged.

Protected reads enforce the same ownership/staff scope, generated-filename
allowlist, MIME, `nosniff`, and `Cache-Control: private, no-store`. No static
collection-photo route exists. Cancelled/expired evidence is retained for future
investigation. A later retention/backup policy is still needed. A process crash
between file write and database commit can leave an unreferenced private file;
no unsafe automatic deletion of history is implemented. Cleanup failures are
reported to the server log, not silently converted into public access.

## Audit and Real-Time

Centralized actions added:

- Collection Verification Started
- Barcode Verification Succeeded
- Barcode Verification Failed
- Collection Photo Uploaded
- Collection Photo Replaced
- Verification Session Cancelled
- Verification Session Expired
- Resident Confirmed Collection
- Collection Completed

Existing Parcel Collected is recorded once per selected parcel, with Resident
actor and initiating Guard reference. Session/unit/tracking references and
timestamps support chain-of-custody tracing. Raw scan history is stored only in
the protected attempts table, not general audit metadata. Audit events contain
no QR/JWT secrets, private photo paths or image contents. Admin/Guard can view
these operational actions under the existing audit query rules; no Audit UI was
changed and no Super Admin event/access was added.

The existing private Socket.IO infrastructure emits
`collection:verification-started` after first initiation and the existing
`collection:completed` only after first Resident confirmation. Repeated requests
emit neither again. No namespace, email/push adapter, preference, notification
category or notification recipient policy was changed. The old collection flow
had no collection Email/Browser Push event; this step does not invent one.

## Targeted Validation

Executed:

```sh
docker compose exec -T backend env COLLECTION_VERIFICATION_INTEGRATION=true node --test --test-reporter=spec tests/collection-verification.test.js
docker compose exec -T backend npm run db:migrate
git diff --check
```

The final focused suite passed 12/12 checks (three validation units, the integration
parent and eight API/database scenarios), with no skips. API tests use actual
Express routes, JWT middleware and PostgreSQL with fixture users/parcels/QRs inside
an outer transaction; business commits use savepoints and final rollback removes
fixtures. Private test-photo files are also removed. Independent PostgreSQL
connections verify advisory-lock contention/release; reservation uniqueness and
overlapping-session rejection are tested separately. This is not a simultaneous
full collection load test or a physical camera/browser end-to-end test.

Coverage includes role/ownership/evidence restrictions; invalid/expired/replayed
QRs; scan leaving parcels pending; barcode match/mismatch/unreadable/dedup/cap;
foreign-barcode privacy; missing/invalid/oversized/multiple photos; replacement
and failed-upload cleanup; tampered photo rejection; atomic multi-parcel completion;
tracking/status changes; audit-failure rollback; duplicate confirmation; closed
evidence immutability; cancel/expiry/reservation release; old history without
evidence; and truthful audit/snapshot references. Early tests found the multipart
part-limit issue, which was fixed; the final complete suite reran successfully.

All 11 touched/new backend JavaScript files passed syntax checks, and
`git diff --check` passed. The full migration runner succeeded twice. Read-only
post-test counts: 48 parcels, 13 existing collections, zero new verification
sessions/evidence/attempts; private test-photo directory contains zero files.
No comprehensive project regression suite or frontend build was run, since the
step is backend-only. No real notifications, Gemini calls or camera scans were
performed. Socket delivery was not tested with an actual client.

## Step 18A Files

New:

- `backend/src/db/migrations/015_resident_collection_verification.sql`
- `backend/src/services/collectionVerification.service.js`
- `backend/src/services/collectionVerificationScheduler.service.js`
- `backend/src/controllers/collectionVerification.controller.js`
- `backend/src/middleware/collectionVerification.middleware.js`
- `backend/src/utils/collectionVerification.js`
- `backend/tests/collection-verification.test.js`
- `backend/docs/collection-verification.md`

Modified:

- `backend/src/services/parcelCollection.service.js`
- `backend/src/controllers/parcelCollection.controller.js`
- `backend/src/routes/parcelCollection.routes.js`
- `backend/src/services/audit.service.js`
- `backend/src/server.js`
- `.gitignore` (private evidence exclusion only)

Other dirty files are earlier work and were preserved. No frontend file was edited.

## Step 18B Readiness

The backend foundation is ready for integration, not a completed frontend release.
The next UI must handle verification-started rather than collection-completed on
Guard scan, retrieve the Resident's active session, scan each barcode, upload each
photo with Bearer authentication, show mismatch/requirements/errors, and send the
Resident-only confirm request. On completion, consume the existing completion
event or REST result; reconnect/reload must retrieve durable session state.

An uploaded image alone cannot establish that a live camera captured the physical
parcel; the later UI must implement that interaction. No physical-code authenticity
or image matching is claimed. The 15-minute policy, rate bounds, storage backup/
retention and deployment capacity should be reviewed before production use.
No Parcel Trace UI/search, Python service, OCR, image similarity, dashboard/report
redesign, Step 18B/18C UI or additional feature was started.
