# Parcel Nexus Operations Dashboards

## Scope
The Admin dashboard uses real data and the approved GEMS shell, fonts and palette.
The latest refinement removes its attention table and the Guard dashboard's
Pending collection follow-up table. Latest parcels logged remains on Guard.
Summary cards put numbers above labels. Admin adds related icons to the left;
Guard and Resident keep their existing icon-free cards. All three dashboards open with a personalized greeting,
using Malaysia time and the signed-in user's first name. Missing names omit
the comma/name rather than showing a placeholder. The greeting updates each
minute and cleans up its timer. Admin then shows Parcel Summary. Existing parcel
and collection workflows remain unchanged. Super Admin content is unchanged. No migration,
dependency, destructive database operation or live reminder send is required.

## Parcel Summary and Attention
Admin retains four compact Parcel Summary cards and its room selector:
All/room buttons on desktop with at most three rooms; a dropdown on phones or
when more rooms exist. Inactive rooms and Not Assigned remain supported.
Its labels are Registered Today, Collected Today, Awaiting Collection and
Overdue. Numbers and icons use blue, green, amber and red respectively;
all labels stay dark navy. There is no colored top line. Cards stay white at
rest and show a matching soft tint on hover, with reduced-motion support.
Each icon sits to the left of the number/label stack, matching the supplied
compact reference without adopting its colors. The former dispute summary cards are
replaced by the personal dispute cards described below.
The four Admin parcel cards use 84px minimum heights (88px on phones),
28px numbers and a 3px number-to-label gap. Labels wrap on narrow screens
without clipping. The four-column desktop/two-column phone layout is unchanged.

Admin shows parcel attention as an icon-led row under Needs attention; Guard
retains its yellow note beneath the summary. It is shown only for a positive count:
"Attention: N parcels have been overdue for more than 60 days."
Singular wording is used for one parcel. Zero counts do not show an empty note.
Both alert counts are building-wide, independent of the summary room filter.
The count is never hardcoded to nine. Resident summary values stay unit-scoped;
Residents do not receive the building-wide attention count.

The count is parameterized PostgreSQL data, not a count of downloaded rows:
non-deleted, uncollected parcels whose stored collection deadline is strictly
earlier than NOW() minus 60 days. Exactly 60 days is excluded. This is days past
the deadline, not days since registration. Collected parcels are excluded.

Guard's existing summary, room distribution, action banner and latest parcels
are retained. Its old general-overdue alert is replaced by the new caution.
Existing statuses, automatic reminders and notification preferences are unchanged.

## Clock and Filter Behavior
A shared MalaysiaClock renders weekday, date and time using Asia/Kuala_Lumpur,
with a live minute display and timer cleanup. On Admin, Guard and Resident it
appears at the far right of the greeting row, wrapping below on narrow phones.
The top bar has no datetime and other pages do not show this clock. The shared
workspace header retains its page name, role-scoped search and notifications.
Export and the top avatar remain removed.
Report export is now a page action on Analytics and Reporting only.
Admin room changes retain current figures and the mounted charts without
spinners, loading messages, page dimming, lost date drafts or scroll reset.
Obsolete reads are aborted. Initial page loading and date-chart loading retain
their existing feedback; errors offer Retry/Reset filters.

Command+K/Ctrl+K still focuses Admin search. Enter opens Parcel Management with
the search prefilled and its registration date filter set to All, so older
parcels are searchable. The parcel page's visual design is not changed.
The room chart and Needs attention share a two-column row after the parcel
summary on desktop. The chart takes roughly three-fifths of the row, with alerts
on the right. Chart tools and the attention list retain the supplied Parcelroom
ZIP's no-border treatment and 20px corners, with a shared soft raised shadow.
Solid white surfaces without backdrop blur retain raised shadows over the white
#FFFFFF canvas. Summary cards use the ZIP's 16px corners and white
surface while preserving the approved compact layout and status colors. Below 1100px they
stack in the same reading order; phone padding reduces to fit the chart. Section
headings match the ZIP's measured Outfit/500 roles: Parcel Summary is 16px
(15px at <=560px); chart headings are 18px (17px at 561-1100px). The greeting
matches its page headline: 30px desktop, 26px at 561-900px, 25px at <=560px,
with 1.25 line-height. Prominent 28px summary counts and existing body/label
sizes remain unchanged. The dispute area below is unframed with individual case cards, not
cards nested inside another card. The chart
always compares all assigned rooms. All Uncollected displays both stacks; By
Status reveals an Awaiting Collection/Overdue selector. Existing tooltips and
unassigned exclusion remain. Tooltips do not intercept chart controls.

## Personal Actions and Needs Attention
Disputes needing your action counts all ESCALATED cases available for pickup,
plus IN_REVIEW_ADMIN cases assigned to the signed-in admin. Other admins' review
cases, Guard review, Open, resolved and deleted cases are excluded. Up to five
case cards appear below the chart/alerts row, ordered by oldest latest activity,
then creation time and id. The cards share StaffDisputeCard with the existing
Disputes board: issue, tracking number, courier, unit, opened date, handler and
latest activity. Dashboard cards are not draggable and open the existing detail
route on click, Enter or Space. Board drag eligibility remains in StaffDisputesPage.
Cards use three desktop columns, two on tablet and one on phones; only individual
cases are framed, with light borders, 8px corners and the shared card elevation.
Latest activity is the greater of the dispute update and its most recent message,
matching the existing dispute board. View All opens Disputes; case links open
the existing detail view. Fewer than five genuine cases are not padded.

Needs attention combines parcels strictly over 60 days past deadline, disputes
still unresolved strictly more than seven days after creation, and pending
activation counts split between resident and guard. These counts are global and
ignore the summary room filter. Resolved/deleted disputes and deactivated
accounts are excluded. Zero-count alerts are omitted; an all-clear state replaces
the list when every count is zero. The heading has no total. Each row has a soft
colored icon tile, one direct sentence (for example, "3 parcels have been overdue
for more than 60 days.") without a separate title/description, and a
chevron. Full-row links support hover, visible keyboard focus and native
modified-click navigation. Account rows open Accounts; disputes open Disputes.
The parcel row opens the overdue parcel list with all registration dates, so
old parcels are not hidden by the default seven-day view. That destination
includes all overdue parcels, not only the over-60-day alert subset.

## Analytics and Reporting
/analytics is an Admin-only page, linked after Accounts in the flat Admin menu.
It now has eight analytics views, shared period/room controls, dispute/system
summaries and PDF reports. See analytics-and-reporting.md for the event-date,
collection-rate, notification-delay and historical-snapshot definitions. The
dedicated analytics API leaves dashboard calculations and legacy report exports
unchanged. These charts do not appear on the dashboard.

## ZIP Reference Verification
The source is Parcelroom-Admin-Dashboard-Parcel-Rooms.zip, inspected offline
at 1440/834/390px including its CSS cascade and liquid.js indicator behavior.
The embedded DM Sans and Outfit binaries are byte-for-byte identical to the
existing self-hosted app fonts, so no additional font downloads are introduced.
zip-dashboard.browser.mjs compares font family, size, weight and line-height;
set PARCELROOM_REFERENCE_HTML to an extracted index.html for a live reference
comparison. It also verifies surfaces, icon styles, right-aligned datetime,
absence of Updated, sidebar motion/history/collapse and reduced motion.

## APIs and Compatibility
GET /api/dashboard/admin/operations remains Admin-only. It accepts summary
room, date-chart and existing legacy attention filters. It adds
parcel_summary.overdue_over_60_days; existing response fields, including the
retired attention payload, are retained for API compatibility. Reads use a
repeatable-read read-only transaction.
Additive fields are disputes.my_review, action_total and action_items, plus
important_alerts with global parcel/dispute/activation counts. The old all-admin
review count and oldest_unresolved remain available for existing consumers.
Action items also include parcel, assigned_handler and evidence_count for the
shared card. Escalated cases report no assigned admin until picked up, rather
than presenting the previous Guard handler as their current Admin owner.

GET /api/dashboard/guard remains Guard-only and adds
summary.overdue_over_60_days. Existing alert and pending_collection_parcels
response fields remain available even though those UI surfaces are removed.

The legacy Admin/report endpoints remain unchanged. Export report still opens
the existing CSV/PDF flow; its label is shown on hover/focus.
The old manual reminder endpoint and audit action remain available, but neither
dashboard sends reminders in this design. No new reminder schedule is added.

## Ownership
- AdminDashboardView.jsx: Admin widgets, room/date controls, quiet room reads.
- StaffDisputeCard.jsx: shared case presentation and keyboard opening.
- StaffDisputesPage.jsx: board-only drag permissions and lifecycle actions.
- DashboardPage.jsx: Guard removal/caution and existing reports.
- AnalyticsAndReportingPage.jsx: protected Admin analytics entry, sharing report flow.
- DashboardStatus.jsx: shared Malaysia clock and caution note.
- ParcelManagementPage.jsx: narrow query-search initialization.
- admin-operations.css and dashboard.css: scoped and shared dashboard styling.
- adminOperations.js: section-specific pending-state helpers.
- adminOperations.service.js: Admin snapshot and caution count.
- dashboard.service.js: Guard's existing snapshot count.

## Verification
Backend operations coverage uses rollback-only database/HTTP fixtures. It checks
the strict 60-day boundary, room scoping, collected/deleted exclusions, Guard
authorization, legacy contracts and existing notifications/audit behavior.
The current operations suite passed 16 checks, including requester-scoped review
counts, shared escalated pickup, latest-message ordering, a five-case limit,
strict seven-day dispute age and global alert scoping. Fixtures roll back;
no live reminder delivery is exercised. Nine frontend helper tests also passed.

Browser fixtures cover all three roles at 1440/834/390px, attention plural/zero states,
removed lists, quiet/stale room updates, chart drafts, search handoff, reports,
clock ticking, error recovery and other-role isolation. The latest browser run
passed 86 scenarios, including dashboard/analytics separation, personal action
copy, global alerts, report downloads on analytics and direct analytics-route
denial for Guard, Resident and Super Admin. The shared shell suite passed 12
role/viewport scenarios with the new Admin-only sidebar entry.
The card-layout checks cover side-by-side chart/alerts on desktop, stacked
sections on tablet/phone, three/two/one card columns, real parcel/handler fields,
non-draggable dashboard cards and keyboard opening. Shared-card regression
checks retain the Admin and Guard board's existing drag permissions. The
rollback-only backend suite verifies the additional card metadata and preserves
the same action counts/order. The initial narrow-chart hover check found a
tooltip intercepting filter clicks; the fix keeps tooltips clear of the controls
and non-intercepting, and the full browser confirmation passed.
The attention checks cover colored icon tiles, no heading total, direct sentences, omitted zero
rows, the all-clear state, keyboard focus, navigation and all-date overdue links.
Computed contrast passes for the large colored numbers and navy labels. Desktop/phone
screenshots for all three roles were inspected
without visible overlap, and document overflow assertions passed at all three
widths. The production build and whitespace check passed. These checks do not
establish production email delivery or send live writes. The build retains
existing OpenCV externalization/large-chunk warnings. Legacy dashboard tests
also retain the existing pg concurrent-query deprecation warning.

Tests: backend/tests/admin-operations.test.js,
frontend/tests/admin-dashboard.test.js,
frontend/tests/admin-dashboard.browser.mjs.

## Room Chart and Export Placement
The workspace header no longer includes an export icon or profile avatar.
Analytics and Reporting has an Export Report page action that opens the same
CSV/PDF report flow. The dashboard has no export button.

Uncollected Parcels by Room excludes unassigned parcels from bars and axis
scaling only. Overall parcel summary totals and backend responses
still include them. The chart uses blue pending and pink overdue stacks,
dashed vertical gridlines, whole-number ticks, a Number of Parcels axis label
and totals immediately after each bar. The pending/overdue selector remains.
Its View chart data section is removed. Hover, keyboard focus or a tap on a
room row reveals its name and counts in a tooltip; Escape dismisses it.
Filtered tooltips show only the selected status and its total, rather than
labelling hidden counts as zero. The other charts' data sections are unchanged.
Inactive assigned rooms remain visible. Empty assigned data shows an empty
state; zero-count rooms keep a zero total rather than a fabricated bar.
This refinement passed nine helper tests, 60 browser scenarios and the
production build. Desktop, tablet and phone screenshots were inspected with
no overlap or page overflow. Browser data and downloads used intercepted
fixtures, with no live writes.
The tooltip refinement passed 63 browser scenarios and a production build,
covering hover, focus, click, Escape, filtered counts and removal of this chart's
data section. Tooltip screenshots were checked on desktop, tablet and phone.
The chart legend and tooltip say Awaiting Collection instead of Pending. Its
view modes are All Uncollected and By Status. The latter offers Awaiting
Collection Only and Overdue Only. Internal status values and calculations are unchanged.
