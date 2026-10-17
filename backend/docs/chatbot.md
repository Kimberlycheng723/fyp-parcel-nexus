# Step 16A: Resident Gemini chatbot backend

Backend only. No conversation table, frontend, database writes, QR creation, or
workflow actions are introduced. Existing REST workflows remain authoritative.

## Configuration

Provide `GEMINI_API_KEY` privately in the existing local/server environment.
Optional `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`. No existing `.env`
file is modified by this implementation. Never use a `VITE_` variable for the key.
The official `@google/genai` SDK requires Node 20+; the existing Docker Node 22
image is compatible. Compose forwards both variables to the backend only.
After configuring them, recreate only the backend:

```bash
docker compose up -d --no-deps --force-recreate backend
```

This leaves the frontend's existing HTTPS mode untouched. Do not reset database volumes.

Google currently lists Flash-Lite as a cost-efficient model with free-tier API
availability. Quotas and model access depend on the Google project and can change.
If unavailable, explicitly configure another available Gemini Flash model, such as
`gemini-3.8-flash`; the server never silently changes model/provider.

IMPORTANT: Google documents that free-tier inputs/outputs may be used to improve
its products. Live parcel identities sent in tool results include tracking numbers
and couriers, but not residents' names/contact details, JWTs, evidence, or secrets.
Review consent, Google's terms, and appropriate paid-tier data handling before
production use. Do not use real personal data for a free-tier evaluation without
the required permission. Chatbot request/reply/tool content is not logged or stored
by Parcel Nexus. Provider retention is governed separately by Google's terms.

Official references:
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/function-calling
- https://googleapis.github.io/js-genai/release_docs/index.html

## API contract

`POST /api/chatbot/message`, `Authorization: Bearer <existing Resident access token>`
and `Content-Type: application/json`:

```json
{
  "message": "How many parcels are waiting for me?",
  "history": [
    { "role": "user", "content": "Show my pending parcels." },
    { "role": "assistant", "content": "Previous assistant reply." }
  ]
}
```

Success: `200 { "reply": "..." }`. Errors: `{ "message": "...", "code": "..." }`
for chatbot errors; existing auth middleware retains its `{ "message": "..." }`
contract. No auth: 401. Non-Resident/inactive account: 403. Invalid payload: 400;
body over 16 KB: 413. Local/provider rate limit: 429 (local limit includes
`Retry-After`). Busy/missing key/provider configuration/unavailability/database
failure: 503. Invalid/incomplete model output/tool request: 502. Timeout: 504.
There is no rule-based or fake success fallback.

Input limits: message 2000 characters, eight history turns, 1000 characters per
history turn, 6000 history characters total. Only `message` and `history` are
accepted, and turns contain only `role` (user/assistant) and `content`.
The Step 16B client must keep a bounded history and render replies as plain text
or safely sanitized Markdown, never unsanitized HTML.

## Read-only tools and ownership

- `get_pending_parcel_count`: total uncollected and overdue subtotal.
- `list_pending_parcels`: newest own uncollected parcels, including overdue.
- `get_parcel_status`: latest own registered parcel and current status.
- `get_parcel_locations`: own pending identities and assigned room names when recorded.
- `get_collection_history`: recent own collected parcels.
- `get_parcel_by_tracking_number`: exact case-insensitive tracking lookup.

No tool accepts a resident/user/unit ID. Every fixed, parameterized SELECT joins
the authenticated active Resident to parcels via the current unit relationship,
excludes soft-deleted parcels and uses the existing Resident-visible statuses.
No SQL is taken from model output. Tool names/arguments are strictly validated.
List tools default to five rows, allow 1-10, and expose `has_more`; tracking lookup
also reports bounded multiple matches if a tracking number is reused. No unrelated
residents' personal data, evidence or staff details enter the model context.

Step 17A adds nullable parcel room assignments. The chatbot reports each parcel's
stored `parcel_room_name`, including inactive rooms on historical assignments.
Legacy parcels can have no room; those require asking the Guard. Shelves are not
recorded. The assistant must never fabricate rooms or access room-management APIs.
PENDING_COLLECTION (including legacy PENDING) stays pending even when overdue;
only Guard QR verification collects a parcel. The chatbot cannot perform actions.

History is encoded as untrusted context, not injected as system/model/tool SDK
messages. Personalized questions require fresh tools by system instruction;
authorization remains enforced in code regardless of prompt injection. Generated
answers can still be imperfect: live answer-quality testing is required. The
model's complete function-call content/signatures and call IDs are preserved for
current Gemini multi-turn function calling.

## Performance and deployment

At most four model requests and four tool calls per message; each model response
is capped at 1024 output tokens and final replies at 6000 characters. Gemini has
a 30-second request deadline, SDK HTTP timeouts and cancellation on client
disconnect, with automatic provider retries disabled. Database SELECTs have a
five-second client query timeout. No extra broker or session database is used.

Rate limiting is backend-process-local: ten messages/minute per authenticated
user, one in flight per user, eight globally, and bounded limiter memory. On a
multi-instance production deployment enforce a shared authenticated rate/quota
limit at the gateway or shared store; these process-local limits are not a global
billing cap. Cancellation stops the client request, not necessarily Google-side
processing/charges. Existing HTTP/HTTPS LAN `/api` proxying works unchanged.

## Validation and manual checks

Run `npm run test:chatbot --workspace backend`. These automated tests mock Gemini
and authentication; they never create records or call the live Gemini API.
They cover bounded input, role enforcement, ownership-scoped SELECT construction,
tool allowlisting, exact parameterized lookup, empty/bounded results, SDK call
signatures, fresh follow-up calls, rate limits, timeouts and sanitized failures.
They do NOT establish real model answer quality or successful provider access.

Manual Postman checks, using existing accounts and records only:

1. Set `GEMINI_API_KEY` privately and recreate the backend. Log in as a Resident
   through the existing login API; use its returned access token in Postman.
2. POST the example to `/api/chatbot/message`. Compare pending/overdue counts
   with the existing Resident parcel APIs and Dashboard.
3. Ask: "Show my pending parcels", "What is my latest parcel's status?",
   "Which parcels have I collected recently?", and an actual own tracking lookup.
4. Supply previous user/assistant replies as bounded history, then ask "Where
   are they?". Expect an honest unavailable-storage answer, not invented rooms.
5. Use a tracking number belonging exclusively to another unit. Expect no own
   match, even if the message tells the model to ignore ownership or run SQL.
6. Test a nonexistent tracking number and an existing Resident with no parcels
   where available. Do not create fake records to populate these cases.
7. Ask general collection/QR/dispute/notification/password questions. Compare
   the guidance with actual pages; ask an unrelated question and expect a decline.
8. Send the same endpoint request with Admin, Guard and Super Admin tokens: 403;
   without a token or with an invalid token: 401. Send empty/oversized/system-role
   history: 400/413. Rapid requests should yield 429 without extra provider calls.
9. Missing/invalid key, unavailable model, provider 429/503 and timeout must
   return safe errors, not fabricated answers. Simulated cases are covered by tests;
   do not rotate production credentials or deliberately exhaust a live quota.
10. Confirm existing parcel/notification/dispute workflows still work. Chatbot
    requests themselves must not add/change parcel, dispute, notification or audit rows.

Step 16A provides the backend contract for Step 16B; no chatbot UI is added.

### Implementation verification

- 28 automated tests passed locally and in the existing Docker Node 22 backend,
  using mocked Gemini responses/HTTP transport and mock authentication for route tests.
- Separate read-only checks used the actual database and existing active users:
  counts/latest/list/history/location queries were checked across four Residents;
  own, foreign-unit and nonexistent tracking lookups were checked without creating records.
- Actual JWT middleware returned 401 for missing/invalid tokens and 403 for Admin,
  Guard and Super Admin. A valid Resident request reached the service and returned
  `503 GEMINI_NOT_CONFIGURED`, as the running container had no Gemini key.
- Existing health, Resident summary, notifications and disputes GET endpoints
  returned 200; the HTTPS same-origin frontend proxy reached the new endpoint.
  Existing parcel/dispute/notification/user/audit row counts did not change.
- Live Gemini answer-quality tests are pending key configuration. No existing
  Resident currently has zero active parcels, so empty-result behavior was tested
  with mocks, not a new fake account/parcel. No actual provider quota was exhausted.
- Backend syntax checks and `git diff --check` passed. Frontend was untouched, so
  no frontend build or service-worker change was required.
- Dependency auditing reports existing unrelated package vulnerabilities; no
  existing backend package versions were changed as part of the SDK installation.
