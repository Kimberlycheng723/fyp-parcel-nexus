# Feature 18: Manual Demonstration Checklist

Use a dedicated demo database and uploads directory. Do not delete immutable
production history or overwrite genuine parcel evidence to test errors. The
automated `@feature18.invalid` accounts were disposable and are not permanent
project logins. Prepare approved active Resident A/Resident B (different units),
Guard, Admin and Super Admin accounts using existing account management.

Use two independent devices or browser sessions; never share a token between
roles. Physical phones require HTTPS (localhost is only a desktop exception).
Keep the current two-minute QR and fifteen-minute verification expiry policies.
Dates displayed in the application use Malaysia time. Record test parcel,
collection, session, dispute and investigation IDs for read-only database checks.

## A: Two-Device Collection
Requires Resident A, Guard, two own-unit pending parcels in different rooms, real
database, separate sessions, and physical Guard camera for device sign-off.

1. Resident selects both parcels and generates one QR. Guard scans within two minutes.
2. Check Guard shows Verification Started, rooms and the backend deadline; parcels
   are still pending. Resident should detect the same session.
3. Resident verifies both labels and explicitly uploads both photos, then confirms.
4. Only now should Resident show Collection Confirmed and Guard Collection Completed.

Inspect `parcel_collections` (USED), `collection_verification_sessions` (COMPLETED,
correct Resident/Guard, confirmed/completed times), selected `parcels` (COLLECTED),
and per-parcel evidence. QR generation/scan alone must never finalize collection.

## B: Multi-Parcel Verification
Requires Resident A, Guard, two pending parcels, real database and manual labels
or physical Resident barcode camera.

1. Start a two-parcel session. Verify/upload only the first parcel.
2. Confirm must stay disabled; Guard should report partial progress.
3. Finish the second parcel. Guard should say Awaiting Resident Confirmation.
4. Resident confirms; both parcels must finish together, never partially.

Inspect one evidence row per session/parcel and exactly one existing collection.
Repeat confirmation through a controlled API client: success should be idempotent,
with no additional completion or per-parcel collection audit events.

## C: Incorrect Barcode
Requires both Residents, Guard, controlled labels from both units, real database,
and physical barcode camera if evaluating camera behavior.

1. During Resident A verification, enter/scan a different tracking number.
2. Expect Mismatch and blocked confirmation, without disclosure of its other owner.
3. Scan the correct label. The earlier failed attempt must remain recorded.
4. Repeat the current identical value: it must not create inconsistent evidence.

Inspect `collection_barcode_attempts`: correct evidence/session/actor, MISMATCHED
then MATCHED as appropriate. A failed scan is not proof of completed collection.

## D: Missing/Invalid Photo
Requires Resident A and Guard, active session, real database; physical Resident
camera is needed for capture/retake sign-off.

1. Verify every barcode but leave one photo missing. Confirm must remain blocked.
2. Choose a valid JPG/PNG. The preview alone must not satisfy upload requirements.
3. Use & Upload Photo; then retake/replace while active. Discard an unsubmitted
   preview and verify the saved photo remains correctly represented.
4. Try a non-image, invalid MIME and a file over 5MB in the demo environment.

Expect clear errors and no accepted invalid evidence. Inspect one current photo
association per evidence row; replacement audit records apply while active. Closed
evidence must reject replacement. Never tamper with real stored photos.

## E: Two Separate Expiry Windows
Requires Resident A, Guard, separate fresh test attempts and real database.

1. Generate a QR and wait over two minutes without scanning; Guard must reject it.
2. Generate a fresh QR and scan promptly. Check a new backend fifteen-minute deadline.
3. Let that verification expire naturally; confirmation/upload must be rejected and
   reservations released. Cancel another active attempt and check the same behavior.
4. Refresh either client: the backend deadline must not restart or extend.

Inspect EXPIRED/CANCELLED session/collection state and reservation removal. Do not
shorten application constants or alter production timestamps for this test.

## F: Parcel Trace
Requires Admin and Guard, controlled registered/collected parcels, real database.

1. Open Parcel Trace and search an exact tracking number.
2. If two couriers/records use that tracking number, explicitly select the correct
   unit/courier record; the application must not silently choose one.
3. Check rooms, status, registration/current photo, collection records and timeline.
4. Use date/status/page filters. Viewing alone must not create an investigation.

Compare authorized API results and `parcels`, `parcel_collection_items`, evidence
and actual timeline sources. Cancelled/mismatched attempts must not appear collected.

## G: Cross-Unit Barcode Trace
Requires Resident B, Guard, Admin/Guard investigator, controlled A/B parcels and
real database. Separate sessions and manual visual assessment are required.

1. In B's session, record a mismatch by scanning A's known tracking label.
2. Correct/cancel B's session according to the chosen test; do not collect A.
3. Open A's Parcel Trace as staff. The cross-unit attempt should be visible.
4. Check its attempted value, result and actual session outcome remain distinct.

Inspect append-only attempts and the joined session/evidence. Residents must not
gain cross-unit investigation access or learn private owner details through scans.

## H: Dispute Navigation
Requires Resident A, Admin/Guard, a permitted parcel-linked dispute and real database.

1. Open the staff dispute details and click Investigate Parcel.
2. Check the correct parcel and dispute IDs in Parcel Trace.
3. Start/view the investigation, then use Return to Dispute.
4. Verify the same dispute opens; an invalid parcel/dispute pairing must be rejected.

Inspect `parcel_investigations.parcel_id/dispute_id`. Investigation status must
remain independent from dispute resolution and collection state.

## I: Actual Collection-Photo Comparison
Requires Admin/Guard, controlled database-backed evidence and human assessment.

1. Select the correct parcel. Load original registration and selected collection
   photos through the authenticated viewers.
2. Test zoom, pan, fullscreen where supported, and responsive stacking.
3. Search completed collections, then separately cancelled/incomplete evidence.
4. Try both batch sizes, Cancel and Continue; check that photos left in the current batch decrease and completed results remain available after pausing. Technical counters should not be displayed.

Original evidence must not change. Processed previews must be labelled as copies.
An unavailable photo or algorithm is not a finding that two parcels differ.

## J: OCR and OpenCV
Requires Admin/Guard, approved readable/blurry/rotated/low-light/different-packaging
photos, real database and manual visual assessment; physical phones for performance.

1. Explicitly start Photo Search; unrelated pages should not load the analysis assets.
2. Check Exact/Possible/Inconclusive/Unavailable distinctions, especially 0/O, 1/I,
   5/S. Unrelated addresses/names/phone numbers must not appear as OCR findings.
3. Select parcel and label crops separately; initialize GrabCut with some surrounding
   background. Test crop-only fallback and original-versus-processed controls.
4. Inspect ORB lines and contradictory text/colour findings. Similar packaging or
   geometric matches must never be treated as identity probability or accusation.

Observe browser network requests: private images stay on authorized application
APIs, no external OCR/image service. Model download/CPU/memory can be costly on phones.

## K: Notes and Investigation Status
Requires Guard/Admin, an investigation, real database and separate role sessions.

1. Add a human note and checklist observations; refresh and check attribution/time.
2. Test permitted review/escalation/resolution/reopening actions for each role.
3. Notes and status history must remain append-only; no edit/delete bypass.
4. Check actions appear in Audit Trail, without resolving the associated dispute
   or altering the parcel's collected state automatically.

Inspect `parcel_investigation_notes`, `parcel_investigation_status_history` and
`audit_logs`. Compare with the existing investigation transition matrix, not the
different dispute transition matrix.

## L: Roles and Photo Access
Requires all roles, separate sessions and a controlled same-unit/foreign-unit photo.

1. Admin/Guard can open Parcel Trace. Resident/Super Admin must have no trace access.
2. Guard/Admin must not confirm collection, submit Resident barcodes or replace
   Resident evidence. Another Resident must not hijack the session.
3. Direct `/uploads/parcels/<generated-filename>` without JWT must return 401;
   authorized staff and owning-unit Resident can read, foreign Resident gets 404,
   Super Admin gets 403. Check `private, no-store` and `nosniff`.
4. Check missing/expired JWT, invalid evidence IDs and path traversal do not reveal
   data or filesystem paths. Resident parcel detail photos must still display.

Use existing authenticated API clients for denied cases; do not publish collection
storage paths or JWTs. Admin-only audit export and Guard-scoped log visibility remain.

## Read-Only Database Checks

Use actual test IDs and parameterized clients (or quoted psql variables), not broad
modification queries. Relevant fields:

```sql
SELECT session_id, collection_id, resident_id, guard_id, status, created_at,
       expires_at, confirmed_at, completed_at, cancelled_at
FROM collection_verification_sessions WHERE session_id = $1;
SELECT parcel_id, barcode_status, attempt_count, photo_uploaded_at
FROM collection_verification_evidence WHERE session_id = $1;
SELECT attempt_id, actor_user_id, result, created_at
FROM collection_barcode_attempts WHERE evidence_id = $1 ORDER BY created_at;
SELECT action, actor_user_id, actor_role, entity_reference, created_at
FROM audit_logs WHERE metadata->>'session_id' = $1 ORDER BY created_at;
```

Do not use unrestricted DELETE/TRUNCATE/reset commands to clean up production
audit or evidence history. Dispose of an isolated demo environment instead.
Existing registration images are current, unversioned references: no historical
original-photo guarantee should be claimed. External email/push delivery and actual
physical rear-camera behavior need their own manual checks before demonstration.
