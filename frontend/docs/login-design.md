# Login design integration

The shared authentication layout adapts the supplied
`parcelroom-residences-login-source.zip`: white form panel with the original soft
color wash, cobalt buttons, DM Sans/Outfit typography, and four visual stages
(arrival, registration, notification, collection). Fonts are self-hosted with
their OFL licenses. Three.js renders the original miniature geometry and projection;
the renderer is loaded on authentication pages and disposed when their layout unmounts.

The main Parcelroom logo, footer/legal/design-preview bar, chapter captions,
chapter controls and progress/sample footer are removed. The login form contains only
email, password, Remember me, and the existing password-reset action.
Need help? opens the shared account-assistance dialog. The visual's parcel identities and QR pattern are decorative source
assets, never authenticated parcel records or real collection tokens.

## Authentication

The form calls the existing AuthContext login method. The backend request still
contains exactly `{ email, password }`; role comes from the authenticated backend
response. Existing role landing routes, expiry checks, logout, and reset APIs
are unchanged. No preview sign-in or password-reset simulator is included.

Remember me is checked by default, retaining the previous localStorage
behavior. Unchecking uses sessionStorage for that browser tab. Both choices use
the same token helper, API authentication and shared socket authentication.
Switching choices removes the previous token; logout/expiry clear both stores.
This does not extend JWT lifetime or add refresh-token behavior.

All imported class names use `pr-` inside `.login-redesign`, and reference color
variables are local to that surface. Login, Forgot Password, Reset Password,
Account Activation and Email Verification share AuthLayout, including success/error states.
Login/Forgot Password swaps and account-result changes retain the animation instance.
PasswordField's login variant is opt-in; Profile fields and dashboards retain their existing design.
The animation pauses offscreen/backgrounded,
respects reduced motion, and cleans up observers, timers, animations and GPU
resources. Unavailable WebGL shows the source fallback without blocking sign-in.

## Checks

```sh
npm run test:login --workspace frontend
node --test frontend/tests/audit.test.js frontend/tests/chatbot.test.js frontend/tests/login.test.js
npm run build --workspace frontend
git diff --check
```

Optional Chrome QA uses an existing Playwright installation; set
`PLAYWRIGHT_MODULE` to its module path and `PARCEL_NEXUS_TEST_URL` to the running
frontend origin, then run `node frontend/tests/login.browser.mjs`.
Focused checks are also available in `login-reset.browser.mjs` and `auth-pages.browser.mjs`
for reset navigation and authentication success/error screens.
It uses isolated intercepted API responses, never real credentials or database
writes. Checks include the four-stage sequence, moving/nonblank canvas, responsive
form/modal, reduced motion, password visibility, errors, duplicate-submit prevention,
existing role redirects, both storage choices and reload authentication.

Manual test on the usual HTTP/HTTPS login origin:

1. Reload `/login` and watch arrival through collection. The logo, footer and
   chapter controls must be absent. On mobile, scroll below the form to see the
   animation; it pauses while offscreen.
2. Open Need help?, close with X or Escape, and confirm focus returns to the
   button. Test outside-click dismissal and mobile dialog fit.
3. Sign in with a real existing account and verify its normal dashboard/landing
   route. Repeat with each supported role, without making new accounts.
4. Check password visibility and Forgot password?. The existing reset page and
   real reset backend remain unchanged.
5. Test Remember me checked/unchecked. Reload should work in both cases;
   an unchecked session belongs to that tab rather than persistent local storage.
   Existing JWT expiry still applies.
6. Recheck the notification bell, parcel collection, and logout. No backend,
   database, environment, proxy, service-worker, or Docker configuration changed.

Automated layout checks use desktop 1440x900, tablet 834x1112 and mobile 390x844.
Physical Safari/iPad/PWA keyboard and sign-in checks remain manual.
