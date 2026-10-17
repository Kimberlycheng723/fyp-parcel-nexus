# Step 16B: Resident AI Chatbot

The dedicated `/chatbot` page uses the existing Resident layout, JWT API client,
and `POST /api/chatbot/message`. Only Residents have a navigation item or route
access. Staff roles and logged-out visitors follow existing protected-route
redirects. The backend remains authoritative for authorization and parcel data.
No browser request goes directly to Google, and no provider credentials are
included in the frontend.

## Conversation behavior

- Suggestions and typed questions use the same request flow.
- Enter sends; Shift+Enter inserts a newline; IME composition does not send.
- Requests contain only `message` and `history`. The input is limited to 2000
  characters. Context includes only completed user/assistant pairs, newest first
  for selection and chronological for transmission: at most eight turns, 1000
  characters per turn, and 6000 history characters. Older pairs are also removed
  when necessary to keep the UTF-8 JSON request within the backend's 16 KB limit.
- Displayed replies are not truncated for context. The transcript is bounded to
  80 messages; context is intentionally shorter than the visible conversation.
- Messages exist only in React state. New Conversation, leaving the page, logout,
  or a different account clears context. Cancelling a request prevents a late
  reply from entering the next conversation.
- Duplicate sends are blocked synchronously. Failed messages preserve their draft;
  retry reuses that message rather than creating a duplicate bubble.
- Replies are escaped React text with preserved line breaks, not HTML or active
  links. Errors are separate alerts, never fabricated assistant answers.
- 401 uses existing session-expiry handling; 403 disables the composer; 429 respects
  `Retry-After` (seconds or HTTP date, with a 10-second fallback). Provider, network,
  validation, empty-response and timeout failures have safe messages. The client
  timeout is 45 seconds, allowing the existing 30-second backend deadline to return.

The assistant provides information and guidance only. Existing pages still perform
parcel collection, disputes, account edits, and other changes.

## Automated checks

```sh
npm run test:chatbot --workspace frontend
node --test frontend/tests/audit.test.js frontend/tests/chatbot.test.js
npm run build --workspace frontend
git diff --check
```

Optional browser QA uses an existing Playwright installation, not a production
dependency. Set `PLAYWRIGHT_MODULE` to its package path when it is not locally
resolvable, `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome, and
`PARCEL_NEXUS_TEST_URL` to the running frontend origin. Then run:

```sh
node frontend/tests/chatbot.browser.mjs
```

By default this uses isolated browser contexts and intercepted test responses;
it creates no real records. Screenshots are written to `/private/tmp`. It checks
desktop/tablet/mobile layouts, suggestions, history, send/retry behavior, auth
redirects, logout/account isolation, safe rendering, and error states.

Opt-in `PARCEL_NEXUS_LIVE_CHATBOT=true` also uses the existing Docker backend,
an existing active Resident, and three actual read-only questions. Credentials
stay in process memory, with no database records created or credentials printed.
Live provider calls may consume quota. Do not enable this without permission to
use the configured provider and existing parcel data.

Implementation checks passed in Chrome at 1440x900, 834x1112 and 390x844, with
no horizontal overflow. All three live questions returned 200 and displayed:
pending count matched the database, the storage follow-up reported unavailable
information, and general QR guidance worked. These checks do not establish answer
quality for every possible question or physical iPhone/iPad keyboard behavior.

## Manual smoke test

1. Open the existing frontend origin and log in as a Resident. Choose AI Chatbot
   from the sidebar/mobile menu, or open `/chatbot` on that same origin.
2. Select the pending-parcel suggestion and compare the answer with Dashboard.
   Ask "Where are they stored?"; expect unavailable-location guidance, not an
   invented room. Ask a general QR or dispute question.
3. Send with Enter, insert a newline with Shift+Enter, and check the loading state.
   Empty input cannot send. New Conversation clears both transcript and context.
4. Log out and sign in as another Resident: no previous transcript should appear.
   With Admin, Guard or Super Admin, confirm no chatbot menu and direct `/chatbot`
   redirects to the existing role landing page.
5. Check desktop, tablet and mobile/PWA, including the physical device keyboard,
   scrollable conversation, usable input, long replies and mobile navigation.
6. With browser network offline, confirm a safe error and preserved question;
   reconnect and retry. Do not intentionally exhaust real Gemini quota.
7. Recheck Dashboard, Disputes, Notifications, bell/toast and existing parcel
   collection workflows. Their providers, sockets and APIs were not changed.

The current development server was HTTP localhost during automated checks.
HTTPS LAN/PWA device testing remains a manual smoke test; no proxy, HTTPS,
service-worker, Docker, backend, database, or environment configuration was changed.
