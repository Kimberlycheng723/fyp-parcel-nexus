# Step 18D: Parcel Trace Investigation Handoff

This records the Step 18D baseline. [Step 18F](feature18-integration.md) subsequently
protected `/uploads/parcels` and verified real browser/API/database integration.
Registration images remain current, unversioned assets; the historical public
route warning below is superseded by the authenticated-photo remediation.

## Scope and Architecture

Parcel Trace is an Admin/Guard investigation workspace at `/parcel-trace`, usable
independently or from a parcel-linked dispute. It supports exact tracking-number
search, cross-unit barcode tracing, filtered collection metadata, manual photo
comparison, append-only notes, independent investigation statuses and a recorded
activity timeline. Viewing a parcel does not create an investigation.

The implementation reuses Express/JWT/PostgreSQL, the existing audit writer,
collection-verification records, React protected routing, API helpers and Lucide.
No new dependency, paid service, environment setting, Resident source change or
collection mutation change belongs to Step 18D. QR/session expiry, Resident-only
confirmation, reservations and existing dispute resolution remain unchanged.

Request flow: protected React page -> existing Bearer API helpers ->
`/api/parcel-trace` router -> controller -> service/validation helpers -> existing
records plus migration 016 investigation tables. Images use separate authorized
read endpoints; the investigation service never uploads or replaces evidence.

Authoritative source: [service](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/services/parcelTrace.service.js),
[routes](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/routes/parcelTrace.routes.js),
[controller](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/controllers/parcelTrace.controller.js)
and [validation](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/utils/parcelTrace.js).
Earlier collection behavior is documented in
[Step 18A](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/docs/collection-verification.md),
[18B](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/docs/resident-collection-verification.md)
and [18C](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/docs/guard-collection-verification.md).

## Incumbent Design Extension

This is an extension of the incumbent operational interface, not a new visual
system. [base.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/base.css)
supplies Inter/system typography, ink/muted text, soft backgrounds, line borders
and navy/blue accents. Existing primary/secondary buttons and
[layout.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/layout.css)
navigation remain in use through `ProtectedLayout`. No global redesign,
`DESIGN.md` or design sidecar is introduced.

The scoped [parcel-trace.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/parcel-trace.css)
adds compact 26px page/18px section headings, border-separated unframed sections,
labelled status chips and 8px candidate/table frames. Desktop evidence is paired;
at 640px it stacks, barcode rows become labelled mobile records, and the timeline
stacks. Overview and candidate density reduce at 1000px; filters reflow at 1250px
and 640px. Photos retain their aspect ratio with `object-fit: contain`.

Compared with the existing parcel/dispute screens, the extension preserves the
shell, button vocabulary, typography and restrained palette while making the
investigation sequence explicit. Status text supplements colour. Icon controls
have labels/titles, inputs have labels, and the native enlarged-photo dialog
supports Escape and focus restoration. Its photo-trigger focus outline is inset
so the clipped image stage does not hide keyboard focus. No complete accessibility
audit is claimed.

## Database and Migration

[016_parcel_trace_investigations.sql](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/db/migrations/016_parcel_trace_investigations.sql)
adds only the investigation persistence below. IDs default to `gen_random_uuid()`;
timestamps are `TIMESTAMPTZ` with server defaults. All declared foreign keys use
`ON DELETE RESTRICT`.

| Table | Stored Fields and Constraints |
| --- | --- |
| `parcel_investigations` | `investigation_id`, required `parcel_id`, nullable `dispute_id`, `status`, `created_by`, `created_at`, `updated_at`. Status is `OPEN`, `UNDER_REVIEW`, `ESCALATED` or `RESOLVED`. |
| `parcel_investigation_notes` | `note_id`, `investigation_id`, `author_id`, snapshotted `author_role` (`ADMIN`/`GUARD`), `content`, JSONB `observations` array, nullable `reviewed_evidence_id`, `created_at`. Trimmed content length is 1-4000. Evidence references the existing verification evidence row. |
| `parcel_investigation_status_history` | `history_id`, `investigation_id`, nullable `previous_status`, required `new_status`, `actor_user_id`, snapshotted `actor_role`, `created_at`. Initial history records null -> `OPEN`. |

Partial unique indexes permit one independent investigation per parcel and one
investigation per non-null dispute. Thus independent and dispute-linked cases
for the same parcel can coexist. Indexes support parcel investigations, ordered
notes/history, `LOWER(parcels.tracking_number)` and collection creation time.

Triggers reject investigation deletion or changes to parcel/dispute/creator/
creation identity. Notes and status history reject UPDATE and DELETE. Status and
`updated_at` remain mutable through the service. No collection evidence or
barcode attempts are copied into new tables. Dispute-to-parcel consistency is
checked by the service, not a composite database foreign key.

The normal full migration runner applied **001-016 twice successfully**. It sorts
and executes all SQL files on each invocation; this is not a migration-ledger
claim. Migration 016 uses repeatable table/index creation and trigger replacement.
No earlier migration, seed, backfill or data reset is part of this step.

```sh
docker compose exec -T backend npm run db:migrate
```

## API Contract

All paths below are relative to `/api/parcel-trace`. All require active-user JWT
authentication and exactly `ADMIN` or `GUARD`; Resident, Super Admin and anonymous
access are not permitted. There is no separate investigation-detail/list endpoint:
the parcel overview selects the case by parcel and optional dispute context.

| Method | Path | Input / Response |
| --- | --- | --- |
| GET | `/parcels` | Required `tracking_number`, pagination; `{ parcels, pagination }`. |
| GET | `/parcels/:parcelId` | Optional `dispute_id`; `{ parcel, dispute, investigation, related_disputes, related_disputes_pagination, allowed_transitions }`. Missing case returns `investigation: null`. |
| GET | `/parcels/:parcelId/barcodes` | Optional `dispute_id`, pagination; `{ attempts, pagination }`. |
| GET | `/parcels/:parcelId/collections` | Collection filters below; `{ collections, pagination, date_window }`. Metadata only. |
| GET | `/parcels/:parcelId/collections/:collectionId/evidence` | Collection filters and pagination; `{ evidence, pagination }`. Metadata only. |
| GET | `/parcels/:parcelId/timeline` | Optional `dispute_id`, pagination; `{ events, pagination }`, oldest first. |
| GET | `/parcels/:parcelId/registration-photo` | Optional `dispute_id`; image bytes, not JSON. |
| GET | `/parcels/:parcelId/evidence/:evidenceId/photo` | Collection filters; eligible image bytes. |
| POST | `/investigations` | Only `{ parcel_id, dispute_id? }`; `{ investigation }`, 201. Existing identical context returns 200 with `already_exists: true`. |
| GET | `/investigations/:investigationId/notes` | Pagination; `{ notes, pagination }`, oldest first. |
| POST | `/investigations/:investigationId/notes` | Note body below; collection filters validate optional reviewed evidence. 201 `{ note: { note_id, created_at } }`. |
| PATCH | `/investigations/:investigationId/status` | Only `{ status }`; `{ investigation }`. |

### Query and Payload Rules

- IDs must match the UUID validator (versions 1-5). SQL values are parameterized.
- Tracking input is trimmed, 1-120 characters, rejecting ASCII control characters.
  Search is exact and case-insensitive, not substring/fuzzy/barcode normalization.
  All legitimate duplicates are returned with pagination; no silent first match.
  No match is 200 with an empty list. Search/overview include soft-deleted parcels
  for investigation and expose `deleted_at` rather than hiding that history.
- Pagination accepts digit-string `page` (1-100000, default 1) and `limit` (1-50,
  default 20). Responses use `{ page, limit, total, total_pages }`; empty totals
  have `total_pages: 0`. Excess/out-of-range values are rejected, not clamped.
- Collection filters: optional `from`, `to`, `tracking_number`, `status`, `unit`,
  `dispute_id`, `page`, `limit`. Dates must be real `YYYY-MM-DD` values with
  `from <= to`. Defaults are the parcel's Malaysia-local registration day through
  the current Malaysia-local day. Filtering is on **collection `created_at`**,
  from inclusive local midnight to exclusive midnight after `to`, not upload or
  confirmation time. There is no maximum date-span constraint.
- Collection `status` is `ACTIVE`, `VERIFYING`, `USED`, `EXPIRED` or `CANCELLED`,
  not verification-session status. Unit is a trimmed exact, case-sensitive unit
  reference, max 120 characters without ASCII controls. Optional tracking filter
  matches case-insensitively against current collection-item parcel tracking,
  evidence registration snapshots or scanned attempts. Empty UI filters are
  omitted by `traceQuery`; unused query keys are not a strict rejected allowlist.
- A supplied dispute must exist, be non-deleted and reference the target parcel.
  Overview returns at most the default 20 related disputes and their pagination
  metadata; the UI directs overflow to Dispute Management.
- Notes accept only `content`, `observations`, `reviewed_evidence_id`. Content is
  trimmed, 1-4000 characters, with NUL rejected. Observations are deduplicated
  from `COLOUR`, `SHAPE`, `LABEL`, `TRACKING`, `PACKAGING`, `MARKS`, `INCONCLUSIVE`.
  They are human checklist selections, never automatic findings. Author/role/
  timestamp come from authenticated server identity. React renders note content
  as text, not HTML. Notes are allowed regardless of investigation status.

### Errors and Request Limits

Expected failures return `{ message }`: 400 for invalid IDs/input/dates/pagination,
403 for forbidden/inactive roles, 404 for missing parcel/investigation, invalid
dispute relationships, ineligible evidence or unavailable photos, and 409 for a
role-disallowed status transition (including a repeated same-status request).
Authentication middleware returns 401 for absent/invalid/expired JWTs or a missing
account. Unexpected failures reach the existing generic 500 handler; the trace
controller logs only the error code/name, not evidence contents.

All trace routes share an in-process fixed-window limit of 120 requests per user
per 60 seconds, including images and mutations. Excess is 429 with `Retry-After:
60`. A new user window when 2000 active windows already exist receives 503. This
is process-local protection, not a distributed rate limiter or automatic retry.

## Trace Semantics and Evidence Scope

Barcode results include attempts for the target parcel **or** attempts whose
scanned value exactly matches its current tracking number, across units. Exact
matches sort first, then newest attempts. Returned fields distinguish attempted
parcel/snapshotted tracking, recorded result, session/unit, session outcome and
completion timestamp using `target_parcel_attempt` and `exact_tracking_match`.

A `MISMATCHED` attempt remains a mismatch even if that related session later
completes. `MATCHED` means a verified barcode, not physical custody. A completed
session does not prove that the investigated parcel belonged to that collection.
The UI explicitly separates attempts, verified barcodes and completed collection,
using neutral relationship labels rather than assigning responsibility.

Collection candidates include all collections satisfying the selected window and
filters, not only barcode-related ones. They sort target membership first, matching
attempt second, then newest creation. Reasons are target listed, matching attempt
requiring review, or date-window-only with no established barcode relationship.
Legacy collections can appear without a session/photo. Unit references prefer
session snapshots; legacy fallback uses the resident's current unit.

Each candidate contains `evidence_count` and at most **three evidence metadata
previews**, ordered by parcel ID. Additional evidence uses the paged evidence
endpoint (UI limit 10; server maximum 50). No image bytes, private filenames,
digests, QR hashes or resident email/phone details are returned in these lists.
Actor names remain available for note/timeline attribution.

An evidence read must belong to a verification session joined to a candidate
collection eligible under the submitted window/filters. It need not belong to
the target parcel or have an exact barcode relationship: date-window-only manual
review is intentional. Both staff roles have this cross-unit investigation read
scope; Guard access here is not restricted to the Guard who started the session.
The original collection API's narrower owner/initiating-Guard/Admin scope is
unchanged. Notes validate selected evidence with the same candidate eligibility.

The frontend passes date window and dispute context to photo/expanded-evidence/
note requests, not the list's optional tracking/status/unit filters. The backend
supports those additional filters, but the UI's read scope is the selected window.
Changing applied filters clears the selected candidate; choosing a candidate
never changes the investigated parcel/reference image.

## Photo Retrieval and Preservation Limits

The registration reader resolves only the parcel's stored server-generated local
`/uploads/parcels/<timestamp>-<uuid>.(jpg|jpeg|png|webp)` asset. It never fetches
submitted remote URLs or accepts client filesystem paths. Collection filenames
must match `<uuid>.(jpg|png)` with JPEG/PNG MIME types and resolve under the existing
private collection directory. `sendFile` uses a fixed root and denies dotfiles.
Responses set `Cache-Control: private, no-store`, `Content-Disposition: inline`
and `X-Content-Type-Options: nosniff`. Missing files become 404.

`ParcelTraceEvidence` uses the existing JWT `apiDownload` helper, validates image
content type, creates Blob URLs for `<img>`, aborts obsolete requests and revokes
URLs during cleanup. Tokens are not placed in image URLs. Initial metadata reads
download no photos; explicit registration loading or candidate selection loads
the requested comparison pair. Missing/access/network/decode errors have visible
states and retry. Enlarged preview provides a 1x-3x slider without transforming
stored evidence. No fake placeholder evidence is supplied.

**Privacy boundary:** the investigation view reads registration photos through
authentication, but the pre-existing public `/uploads/parcels` static mount in
`app.js` is preserved. Step 18D does not fix global registration-photo privacy.
Private collection uploads remain outside that public mount.

**Version boundary:** the registration reader shows the parcel's current asset,
not a versioned original-registration snapshot; its displayed date is parcel
creation time, not a verified image-version date. Collection evidence has one
current photo per evidence row, replaceable while the session is active and
immutable after closure. Replacement history does not provide all old image bytes.
An append-only note's evidence ID therefore does not pin a historical active-photo
version. The trace reader does not redo completion-time SHA-256/byte validation;
existing Resident confirmation still does. Trace itself never mutates photos.

## Notes, Status and Transaction Safety

Investigation identity is the parcel plus nullable dispute context. Starting is
explicit, locks the parcel and returns the existing case on repetition. Both
roles may start a case and append notes. Allowed status targets are returned by
the overview and enforced again server-side under a row lock:

| Current Status | Guard Targets | Admin Targets |
| --- | --- | --- |
| `OPEN` | `UNDER_REVIEW` | `UNDER_REVIEW`, `RESOLVED` |
| `UNDER_REVIEW` | `RESOLVED`, `ESCALATED` | `RESOLVED` |
| `ESCALATED` | None | `UNDER_REVIEW`, `RESOLVED` |
| `RESOLVED` | `UNDER_REVIEW` | `UNDER_REVIEW` |

Reopen means `RESOLVED -> UNDER_REVIEW` on the same investigation. It does not
reopen a dispute, reset a parcel, change ownership, complete a collection or alter
evidence. Investigation and dispute statuses may legitimately disagree; dispute
resolution continues through its existing authorized workflow.

Creation, note insertion and status transition each use BEGIN/COMMIT/ROLLBACK on
one PostgreSQL client. The corresponding history/timestamp updates and audit
insert use that same client. Audit actions are `Investigation Opened`,
`Investigation Note Added`, `Investigation Status Changed`, entity type
`INVESTIGATION`; metadata carries parcel/dispute IDs and note ID or old/new status,
not full note text or photos. Audit failure rolls back the whole mutation, rather
than reporting success without an audit record. The three actions also join the
existing Guard operational audit scope.

## Timeline Record Sources

`traceTimeline` paginates a chronological SQL union, ordered by timestamp then
event ID. It spans the target parcel and all its investigation histories/notes,
not only the selected dispute case. Its actual sources are:

| Source | Events / Qualification |
| --- | --- |
| `parcels` | Registration timestamp/tracking/registered actor. |
| `audit_logs`, entity `PARCEL` | Recorded parcel actions, excluding registration, barcode success/failure, photo upload and collection completion duplicates represented elsewhere. |
| `parcel_collections` + `parcel_collection_items` | Target-linked QR generation; legacy collection time only when no verification session exists. |
| `collection_verification_sessions` + evidence/attempt relations | Guard-start timestamp for target evidence or exact scanned-tracking-related sessions; confirmed timestamp when present. Related-session labels warn to check membership and not infer handover. |
| `collection_barcode_attempts` | Target-parcel or exact scanned-tracking attempts, recorded result/value/time/actor. |
| `collection_verification_evidence` | Current photo upload timestamps in related sessions, including other session parcels. Not every historical photo version. |
| `audit_logs`, entity `COLLECTION` | Related-session collection actions, excluding verification start, Resident confirmation and collection completion duplicates. |
| `dispute_status_history` + `disputes` | Recorded target-parcel dispute status changes. |
| Investigation status history and notes | Initial/open and later status entries; note-added timestamp/reference, not note body. |

Actor names are joined from current users; stored roles are preferred, falling
back to the actor's current role where a historical role was not stored. This is
not a complete immutable actor-name/role snapshot. No synthetic notification,
room-assignment or physical-handover event is generated when a corresponding
record is absent. Existing recorded audit actions may provide those activities.
Collection date-window filters do not filter barcode results or the timeline.

## Frontend and Dispute Integration

[ParcelTracePage](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/pages/ParcelTracePage.jsx)
is protected for Admin/Guard only. Their existing Operations menus add FileSearch
navigation; Resident/Super Admin menus do not. A parcel-linked staff dispute detail
offers `Investigate Parcel`, opening `?parcel_id=...&dispute_id=...`. Return opens
`/disputes?dispute_id=...`, whose staff page initializes the selected detail.
URL context is not authorization: the backend validates the parcel/dispute link.

[useParcelTraceRead](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/hooks/useParcelTraceRead.js)
provides abortable reads, retry, query/revision-driven refresh and stale-response
protection. It clears data on changed context and 401/403/404; same-key refresh
can retain previous data for temporary failures. Explicit repeated search bumps
a revision so an identical tracking query still makes a fresh request. Successful
mutations refresh overview/notes/timeline. There is no trace polling or new Socket
event. In-flight mutations are guarded against duplicate UI submissions.

The seven observation checks are saved with a note and reset when a different
candidate is selected. They do not auto-populate, calculate similarity or resolve
the investigation. Source utilities format dates/times in `Asia/Kuala_Lumpur`;
missing timestamps remain `Not recorded`.

## Known Limits and Step 18E Hooks

This is manual review, not a finding of theft, wrong collection or resident
responsibility. Candidate relevance is membership/tracking/window based, not
visual. There is no OCR, OpenCV, ORB, similarity percentage, ranking model,
automated accusation or automatic status update.

Future authorized-browser work can reuse the filtered/paged candidate metadata,
three-row previews, paged evidence IDs, protected Blob reader, fixed target image
and human-note observations. Step 18E could add Tesseract.js OCR, OpenCV.js
GrabCut, colour histograms, shape/contour comparison and ORB matching, then perform
filtered batch photo retrieval with bounded concurrency, cancellation and explicit
user initiation. These are extension points, not implemented dependencies/APIs.
Do not change evidence storage or Resident verification/confirmation to add them.
Keep computed suggestions separate from human findings and do not claim existing
note payloads accept arbitrary analysis results; their allowlist would require a
deliberate contract change.

Large windows can still yield many candidates: response sizes are bounded but
count/offset queries and correlated metadata checks are not a production-scale
performance guarantee. The existing Step 18A expression index on
`LOWER(scanned_tracking_number)` is reused; no duplicate attempt-tracking column,
cursor pagination, distributed limiter or persistent manual candidate bookmark
is added. Deep-page/concurrent writes can change offset ordering. Investigation
reads are not themselves newly audited. Browser observations are not durable
until saved as notes, and photo-version/privacy limitations above remain.

## Focused File Inventory

This lists Step 18D additions/integration edits only, not every dirty-tree file.

New backend files:
- [parcelTrace.service.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/services/parcelTrace.service.js)
- [parcelTrace.controller.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/controllers/parcelTrace.controller.js)
- [parcelTrace.routes.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/routes/parcelTrace.routes.js)
- [parcelTrace.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/utils/parcelTrace.js)
- [migration 016](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/db/migrations/016_parcel_trace_investigations.sql)
- [parcel-trace.test.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/tests/parcel-trace.test.js)
- [this handoff](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/docs/parcel-trace.md)

New frontend files:
- [ParcelTracePage.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/pages/ParcelTracePage.jsx)
- [ParcelTraceEvidence.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/components/ParcelTraceEvidence.jsx)
- [useParcelTraceRead.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/hooks/useParcelTraceRead.js)
- [parcelTrace.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/utils/parcelTrace.js)
- [parcel-trace.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles/parcel-trace.css)
- [parcel-trace.test.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/tests/parcel-trace.test.js)
- [parcel-trace.browser.mjs](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/tests/parcel-trace.browser.mjs)

Modified integration files:
- [backend app.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/app.js): trace router import/mount only for this step; public registration mount preserved.
- [audit.service.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/backend/src/services/audit.service.js): three investigation actions and Guard operational visibility.
- [App.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/App.jsx): protected route/page.
- [ProtectedLayout.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/components/ProtectedLayout.jsx): staff navigation/mobile title.
- [StaffDisputeDetailModal.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/components/StaffDisputeDetailModal.jsx): investigation action.
- [StaffDisputesPage.jsx](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/pages/StaffDisputesPage.jsx): return-link detail selection.
- [api.js](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/services/api.js): trace read/mutation/photo helpers.
- [styles.css](/Users/kimberlycheng/Desktop/fyp_parcel_nexus/frontend/src/styles.css): scoped trace stylesheet import.

## Executed Verification and Final Review

Final results below were supplied by the implementation owner; the documenter
inspected sources but did not independently rerun these suites.

| Check | Confirmed Result |
| --- | --- |
| Parcel Trace backend HTTP/PostgreSQL and validation suite | **12/12 passed**, including recorded timeline, authorized window and collection/expanded-evidence pagination checks. |
| Frontend focused units | **4/4 passed**. |
| Browser fixture suite | **37 scenarios passed** across **1440, 834 and 390px**, including repeated-search fresh requests, visible photo keyboard-focus outlines and expanded evidence pagination. |
| Existing collection HTTP/PostgreSQL regression | **12 passed** earlier with unchanged collection core. |
| Full migration runner | **001-016 applied twice successfully**. |
| Final frontend production build | **Passed**, with the existing large-chunk warning. |
| Final syntax checks | **Passed** for new backend modules, app/audit integration, backend test, frontend hook and browser script. |
| `git diff --check` | **Passed** after the handoff document was added. |
| Bounded final review | **Ship**: repeated-search freshness and clipped photo focus outline resolved; no fix-introduced regressions identified. No independent review test run. |

The earlier mismatch-test ordering failure was fixed by locating the original
`attempt_id` after later attempts, not changing production barcode behavior.
The added window/pagination test was corrected to filter its unique tracking
fixture rather than assert every existing collection in the window. Those are
test-fixture corrections, distinct from the two reviewed frontend fixes.

Focused reproduction references (not additional execution claims):

```sh
docker compose exec -T backend env PARCEL_TRACE_INTEGRATION=true node --test tests/parcel-trace.test.js
docker compose exec -T backend env COLLECTION_VERIFICATION_INTEGRATION=true node --test tests/collection-verification.test.js
node --test frontend/tests/parcel-trace.test.js
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-trace.browser.mjs
npm --workspace frontend run build
git diff --check
```

Integration flags enable tests only; no application `.env` changes are required.
The browser script targets `PARCEL_NEXUS_TEST_URL` (default localhost:5173),
intercepts API fixtures and blocks sockets. Layout/image/overflow checks are
browser-fixture evidence, not physical-device or live browser-to-database E2E
testing. Backend tests use HTTP/PostgreSQL transaction fixtures, restore database
counts and remove test photos; they do not turn the browser fixture suite into
live E2E. No project-wide regression, physical testing, independent reviewer
testing or live cross-device Socket delivery is claimed.
