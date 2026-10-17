# Step 17G: Chatbot Room Verification

## Scope and Inspection

This was a focused compatibility check, not comprehensive regression testing or
full end-to-end verification. The Step 17A-F room documentation, chatbot backend,
Gemini service, fixed parcel tools, authentication/role middleware, existing
chatbot tests, Resident conversation page, protected routing and API helpers were
inspected. Earlier working-tree changes were preserved.

Room support was already implemented in Step 17A. No production chatbot backend,
frontend, prompt, tool, provider configuration or API contract was changed.
No migrations, database records, environment files or dependencies were changed.
Dashboard calculations, QR, notifications, disputes and Audit Trail were not
modified or comprehensively retested.

## Existing Compatibility

The six existing tools remain read-only and scoped to the authenticated active
Resident's unit. They use fixed, parameterized SELECTs; neither the model nor
message/history can supply another user/unit identity or arbitrary SQL.

`get_parcel_locations`, pending lists, latest status, collected history and exact
tracking lookup return `parcel_room_name` through a LEFT JOIN. There is no active
room predicate, so inactive assignments remain named. Missing assignments return
null with guidance to ask the Guard; no default room or shelf is invented.
Room IDs are not selected into tool results. Pending includes overdue parcels;
legacy PENDING normalizes to PENDING_COLLECTION. Collected history remains
COLLECTED, while cancelled/deleted parcels remain outside Resident tool results.

The existing system instruction requires fresh tool results for personalized
questions, treats history/database strings as untrusted, prohibits invented
locations and makes clear that the chatbot cannot perform workflow actions.
General collection, QR, dispute and notification guidance remains available.

The Resident-only `/chatbot` route and POST `/api/chatbot/message` retain their
existing protected routing, Bearer JWT authentication and backend role checks.
Rate limits, bounded conversation history, query/provider deadlines, cancellation
and safe error handling are unchanged. The conversation UI displays the reply as
React text, without a room-specific parser or unsafe HTML rendering.

## Focused Verification

Deterministic Gemini mocks exercised the real service/tool pipeline for:

1. Where is my parcel SPX123?
2. Which room contains my pending parcels?
3. How many parcels are waiting for me?
4. Where can I collect my parcels?
5. Are my parcels stored in different rooms?

These scripted provider responses verify function-call/result forwarding and
reply handling, not whether live Gemini chooses the correct tool or independently
produces an accurate answer. The test inspects forwarded room names, null
assignments, normalized statuses and counts. No real Gemini call was made.

Additional tests execute the actual tool SQL on PostgreSQL using SELECT-only CTE
fixtures that shadow table names for each query. The connection uses a REPEATABLE
READ, READ ONLY transaction, checked with `SHOW transaction_read_only`, then
rolls back. No fixture records are inserted, and no existing records are updated.
This verifies the SQL engine and synthetic edge cases, not the contents of real
Residents' stored records.

The fixture covers active/inactive/multiple/null rooms, legacy pending and
overdue statuses, collected history, bounded lists with `has_more`, exact
case-insensitive tracking, foreign-unit rejection, nonexistent/deleted/cancelled
lookups, SQL-injection-looking tracking values and non-Resident tool rejection.
The existing chatbot test suite also checks general guidance, latest/history
capabilities, strict input/tool validation, provider error sanitization, budgets,
rate limits, timeout and cancellation. Its HTTP role tests use mocked
authentication; real JWT middleware was inspected but not newly exercised here.

## Confirmed Report Fix

The Parcel Records report's SQL CASE handled COLLECTED and overdue pending
parcels, then defaulted everything else to Pending Collection. A focused test
reproduced `CANCELLED101,CANCELLED,Pending Collection,...` before the fix.

One explicit branch now maps `CANCELLED` to the readable label `Cancelled` in
`getParcelRecordsForReport`. This shared result supplies both CSV Display Status
and PDF Status. Raw CSV Status remains `CANCELLED`; no stored status or report
calculation is changed. Pending, overdue and collected labels, registration-date
boundaries, room filtering, row sorting and soft-deletion exclusion are preserved.

Focused regression assertions verify CSV labels/raw values, room/date filters and
PDF generation. The synthetic PDF was separately text-checked with pypdf,
rendered with PDFium and visually inspected: one page, correct Cancelled label,
other labels/room names intact, and deleted fixtures excluded.

## Executed Checks

```sh
docker compose exec -T backend env PARCEL_ROOM_VERIFICATION_DATABASE=true PARCEL_ROOM_VERIFICATION_PDF=/tmp/parcel-room-cancelled.pdf node --test --test-reporter=spec tests/chatbot.test.js tests/parcel-room-chatbot-verification.test.js
node --test frontend/tests/chatbot.test.js
node --check backend/src/services/dashboard.service.js
node --check backend/tests/parcel-room-chatbot-verification.test.js
git diff --check
```

- Backend: 34/34 checks passed, with no skips in the final run. This combines
  existing chatbot tests and the new focused verification, not every module.
- Frontend chatbot units: 11/11 passed.
- Both backend syntax checks and `git diff --check` passed.
- Focused PDF content/render inspection passed.
- The initial report assertion failed as expected, demonstrating the old label;
  it passed after the one-line fix.

No browser suites, full-system regressions or live Gemini calls were run.
No frontend production build was needed because frontend application code was
unchanged; only this documentation was added under frontend.

`PARCEL_ROOM_VERIFICATION_DATABASE=true` enables the PostgreSQL checks. Without
it, the database parent test is skipped rather than reported as successful.
`PARCEL_ROOM_VERIFICATION_PDF` only saves a temporary generated PDF for inspection;
it does not change application configuration or database contents.

## Files in Step 17G

Modified:

- `backend/src/services/dashboard.service.js` (one report-label branch only).

New:

- `backend/tests/parcel-room-chatbot-verification.test.js`.
- `frontend/docs/parcel-room-chatbot-verification.md`.

The other dirty files belong to earlier work and were not rewritten/reverted.

## Limitations and Manual Verification

Live Gemini availability, tool choice, factual answer quality and actual-browser
rendering were not verified in this step. A prompt is guidance, not proof against
all model mistakes. Existing list bounds remain five by default and ten maximum;
`has_more` must not be presented as a complete list, and totals come from the
count tool. Room names reflect current assignments, not assignment history.

With genuine existing Resident records and the existing private Gemini setup:

1. Ask the five room questions using an actual own tracking number. Compare
   names, counts and statuses with My Parcels; verify separate rooms and null/
   inactive assignments when such records exist. Do not create fake records.
2. Try a tracking number exclusive to another unit and a nonexistent number.
   Expect no accessible match, not another Resident's parcel information.
3. Ask general QR, collection, missing-parcel and notification questions and a
   personalized follow-up. Check that replies use current data and do not claim
   that the chatbot performed a collection, room change or dispute action.
4. As Admin, export a date/room-filtered report containing a real cancelled
   parcel if available. Confirm Cancelled in CSV/PDF, with raw CSV CANCELLED.

Use the existing key privately; no key, model or environment change is required
by this implementation. Live provider evaluation is optional and should follow
the project's existing privacy/consent policy.

Step 17G is complete at its focused verification scope. Parcel Room support is
ready for the next scoped Step 18 work, subject to the above live/manual checks;
this is not a full-system or production-readiness certification. Step 18 has not
been started, and its requirements still need a separate brief.
