# Step 17F: Rooms in Dashboards and Reports

## Scope

This is an incumbent operational UI extension, not a dashboard/report redesign.
Admin and Guard share the new `ParcelRoomDistribution` component, titled
`Parcel Distribution by Room`. It uses HTML/CSS horizontal bars, consistent with
the existing manually rendered charts; no chart library or dependency is added.
Existing typography, colors, headings, date controls, report dialog and download
flow are reused. Resident has no new distribution chart. Guard still has no
report-generation or parcel-export access.

No migration, environment change, data backfill, permanent fixture data, new
endpoint or permission change is introduced. Notification delivery, Audit Trail
including its CSV export, QR collection, disputes and chatbot production behavior
are outside this step. No PRODUCT/DESIGN artifact or visual system is introduced.

## Dashboard Counts

The backend aggregates parcels with a LEFT JOIN to `parcel_rooms`, grouping by
room identity/name/availability. Only non-deleted parcels with status `PENDING`
or `PENDING_COLLECTION` are counted. Overdue parcels remain included because
overdue is derived from the deadline of a pending parcel. Collected, cancelled
and soft-deleted parcels are excluded.

Active and inactive rooms with pending parcels appear; actual null assignments
appear as `Not Assigned`. Empty rooms are omitted. No room UUID is returned in
distribution rows or displayed in the chart. The aggregation is not derived
from a paginated parcel list and introduces no per-room N+1 queries.

Pending and overdue totals are summed from the same grouped query as the bars.
The bar total therefore reconciles with Admin `kpis.pending_collection.value`
and Guard `summary.pending_collection`. Existing other dashboard calculations
and date-range controls are preserved.

These are current, all-time operational counts, independent of the selected
historical dashboard date range, matching the existing pending metric. They are
not counts of parcels registered only in that range or historical assignment
snapshots. Names/assignments reflect the database at the time of the read.

The shared chart provides loading, unavailable, empty and error/retry states,
visible names/counts, inactive labels and a keyboard-focusable scroll area.
Many rooms scroll vertically; long names wrap. Bars are decorative to assistive
technology while the textual labels/counts remain available.

## Reports and APIs

Existing endpoints are extended additively:

- GET `/api/dashboard/admin` and GET `/api/dashboard/guard` add
  `parcel_room_distribution`, an array of `{ parcel_room_name, is_active, count }`.
- GET `/api/dashboard/admin/reports/export` accepts optional `parcel_room_id`
  only for `report_type=parcel_records`: a valid room UUID or exact `unassigned`.
  Omitted/empty means All Rooms. Invalid values or a nonempty room filter on
  another report type return 400. Authorization remains Admin-only.
- GET `/api/parcels/export` adds human-readable `parcel_room_name`, falling back
  to `Not Assigned`, while retaining its existing server-side room/search/status/
  date filters and export scope.

The Admin Generate Report dialog exposes the existing Parcel Records report
alongside Dashboard Summary, not a new report backend. Both support the existing
CSV/PDF formats and period/start-date controls. The room selector appears only
for Parcel Records and loads the existing room API, including inactive rooms,
with All Rooms and Not Assigned options plus loading/error/retry feedback.
Summary requests omit the room filter even after switching from Parcel Records.
The existing user-account-summary API/content is unchanged and is not newly
exposed in the dialog.

Parcel Records CSV retains its existing columns and adds `Parcel Room`; PDF
rows also include the room. Filtering happens in SQL across the full report,
not only a loaded page. Rows remain ordered by registration time descending.
The report window is based on parcel registration (`created_at`) using the
existing Malaysia-local period boundaries. Soft-deleted records are excluded;
the existing inclusion of other statuses is retained.

Dashboard Summary CSV/PDF adds a room-distribution section with the same current
pending counts as the dashboard, even for a historical report period. Its other
sections and calculations remain intact. Account-summary data/content and Audit
Trail exports are not changed by the room integration.

Parcel Management retains its existing room filter, pagination and export flow.
Its generated CSV labels the new room field `Parcel Room`; exports use the
existing server-filtered full result rather than only the visible page.

Formula-leading room values are emitted as literal CSV cells by prefixing an
apostrophe for leading `=`, `+`, `-`, `@`, tab, carriage return or newline. This
room-only handling applies to backend summary/records CSV and frontend Parcel
Management CSV, followed by normal CSV quoting. Stored names, API values and
PDF names are unchanged; unrelated CSV fields are not reformatted.

PDF sample inspection exposed an existing shared-footer issue that could create
phantom blank pages. The footer now uses `lineBreak: false`. This formatting
correction does not change account-summary data or report calculations.

## Validation

All results below were reported by the parent implementation run. The
documentation handoff did not independently execute tests, builds or browsers.

- Final backend: 49/49 checks passed, including real Express routes, JWT and
  PostgreSQL integration inside one outer rollback transaction. Fixture records
  were rolled back and snapshot counts asserted unchanged.
- Final frontend: 36/36 unit checks passed, including room CSV literal-cell
  handling. The earlier 35/35 result preceded that added coverage.
- Step 17F browser passed at 1440px, 834px and 390px for Admin/Guard distribution,
  current counts across date changes, inactive/null/long names, many-room
  scrolling, empty/error/retry states, report CSV/PDF queries/downloads and
  role-specific controls. Denied-role and report-room-loading/retry checks run
  separately at 390px.
- Step 17B management/registration, Step 17C parcel integration, Step 17D
  QR/disputes and Step 17E notifications/audit browser regressions passed at
  all three widths. The final Step 17C run checks actual downloaded CSV contents
  for the Parcel Room header and safe `=`, `+`, `-`, `@` room cells at all widths.
- Final frontend production build passed in 6.75 seconds with the pre-existing
  large-chunk warning. All four touched backend JavaScript syntax checks and
  `git diff --check` passed after the CSV correction.
- Final PDF samples after the footer correction were inspected with pypdf
  content checks and every page rendered with PDFium: the parcel sample had one
  page, the dashboard summary sample two, with no extra blank pages.
- Final reviewer confirmed the single CSV fix resolved; disposition: ship.
  The local dashboard at `http://localhost:5173/dashboard` returned HTTP 200.

The backend tests verify room totals, exclusion rules, inactive/null/empty rooms,
date boundaries, totals reconciliation, role restrictions, combined room/status/
search filters and pagination, CSV contents and PDF response signatures. PDF
content/render inspection is separate from those HTTP signature assertions.

Browser suites intercept APIs and block sockets. They run the actual React UI
with fixtures, not live database writes or real delivery. The Step 17F PDF
download fixture verifies query/download behavior, not PDF document contents;
the backend-generated samples provide the separate PDF inspection above.
Captures include page-overflow assertions at 1440px/834px/390px, with screenshots
under `/private/tmp/parcel-nexus-<name>-<width>.png` and viewport report captures.
`PARCEL_NEXUS_TEST_URL` defaults to `http://localhost:5173`.

No real SMTP, Browser Push, socket-client delivery or physical camera hardware
was tested. Earlier mocked channel/decoder checks do not establish live delivery
or hardware reliability. No real external messages were sent. The CSV fix,
automated reruns and final reviewer disposition are complete.

Representative commands used by the implementation workflow:

```sh
docker compose exec -T backend env PARCEL_ROOM_INTEGRATION=true node --test tests/parcel-rooms.test.js tests/parcel-room-notifications.test.js tests/chatbot.test.js tests/password-reset-email.test.js
node --test frontend/tests/parcel-rooms.test.js frontend/tests/audit.test.js frontend/tests/chatbot.test.js frontend/tests/auth-validation.test.js frontend/tests/password-strength.test.js frontend/tests/login.test.js
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-room-dashboards-reports.browser.mjs
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-rooms.browser.mjs
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-room-integration.browser.mjs
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-room-collection-disputes.browser.mjs
PLAYWRIGHT_MODULE=<existing-playwright-path> node frontend/tests/parcel-room-notifications-audit.browser.mjs
docker compose exec -T frontend npm run build --workspace frontend
node --check backend/src/services/dashboard.service.js
node --check backend/src/controllers/dashboard.controller.js
node --check backend/src/services/parcel.service.js
node --check backend/tests/parcel-rooms.test.js
git diff --check
```

## Limitations and Manual Checks

Room names in dashboards/reports represent current assignments, not assignment
history. Inactive assignments remain named, but a later rename/reassignment can
change a subsequently generated report. Historical names are not reconstructed
from Audit Trail metadata. Registration-date report windows and current pending
summary counts intentionally have different scopes.

The pre-existing Parcel Records display-status expression defaults cancelled
records to `Pending Collection`; this behavior remains outside Step 17F. Raw CSV
`Status` retains the correct `CANCELLED` value. This does not affect the pending
room aggregation, which excludes cancelled records.

Sample PDF page counts describe those samples only, not every possible report.
Real account/browser/device checks and the existing large-chunk warning remain.

1. Open `http://localhost:5173/dashboard` using genuine Admin and Guard accounts.
   Compare room totals with pending counts, including inactive/null/overdue
   assignments, and confirm historical date changes do not redefine that scope.
2. As Admin, download Parcel Records CSV/PDF for All Rooms, an active/inactive
   room and Not Assigned. Compare records with the selected registration window;
   check long names and formula-leading room names in the target spreadsheet app.
3. Download Dashboard Summary and confirm its current-room section. Export
   filtered Parcel Management rows and verify the Parcel Room header, names and
   complete filtered result across pagination.
4. Check keyboard controls, dialog scrolling and many-room readability on
   desktop/tablet/mobile. Confirm Guard cannot generate/export reports and
   Resident/Super Admin do not receive the distribution chart or restricted APIs.
5. Treat live SMTP/push, foreground socket delivery, cross-session behavior and
   physical camera scanning as separate manual regression checks using genuine
   configured accounts; automated fixtures do not confirm them.

## Files

New:

- `frontend/src/components/ParcelRoomDistribution.jsx`
- `frontend/tests/parcel-room-dashboards-reports.browser.mjs`
- `frontend/docs/parcel-room-dashboards-reports.md`

Modified in Step 17F:

- `backend/src/services/dashboard.service.js`
- `backend/src/controllers/dashboard.controller.js`
- `backend/src/services/parcel.service.js`
- `backend/tests/parcel-rooms.test.js`
- `frontend/src/pages/DashboardPage.jsx`
- `frontend/src/pages/ParcelManagementPage.jsx`
- `frontend/src/styles/dashboard.css`
- `frontend/src/utils/parcelRooms.js`
- `frontend/tests/parcel-rooms.test.js`
- `frontend/tests/parcel-room-integration.browser.mjs`

This handoff created only this document; production/test changes above belong
to the parent implementation. Earlier uncommitted work is preserved and is not
included in this step's file list. Step 17G has no provided scope and nothing
has been started; it requires a separately confirmed brief.
