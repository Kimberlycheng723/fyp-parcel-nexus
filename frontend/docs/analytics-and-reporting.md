# Analytics and Reporting

Admin-only `/analytics`, using the shared GEMS shell. Default: last 30 Malaysia
calendar days including today; seven days, this month and custom presets are
also available. Custom dates are inclusive, at most 366 days, and cannot end in
the future. Small room sets use desktop buttons; phones and larger sets use a
dropdown. Inactive rooms remain selectable. All includes unassigned parcels.

## Definitions
- Registration trend/hours use parcels registered in the selected period.
  Registration is the available arrival-time proxy. Weekly groups start Monday;
  boundary weeks/months include only selected dates. Missing counts are zero.
- Collection hours use actual collection timestamps during the period,
  including parcels registered earlier, in six four-hour Malaysia time ranges.
- Notification delay is mean hours from the first recorded PARCEL_ARRIVAL
  notification to collection. Duplicate notifications do not multiply samples.
  Notification time must fall between registration and collection. This is not
  email delivery, reading or push receipt. Missing times are excluded and counted;
  missing daily averages are null gaps, not zero-hour collections.
- Overdue duration is a snapshot of parcels still uncollected at the selected
  period end (or now for today), not a registration-period cohort. Groups use
  completed days past the stored collection deadline: under 3, 3-7, 8-30,
  31-60 and 61+ (Over 60 days). Parcels collected after the cutoff remain in the
  historical snapshot. Cancelled/deleted parcels and unknown collection times
  cannot be assumed to be historically uncollected.
- Collection rate is parcels registered AND collected in the period / all
  registrations in that period. Carry-in collections do not enter the numerator.
  No registrations means no rate, not zero percent. Unknown collection times
  are never inferred; invalid negative timings are excluded.
- Dispute issues use cases reported during the period. Resolution timings use
  cases resolved during the period and elapsed time from report to resolution.
  Buckets: under 1, 1-2, 3-6, 7-13 and 14+ days. Open cases do not enter averages.
  Unresolved-at-end counts include older cases still unresolved at the cutoff.
- Current system summary is explicitly building-wide and current, not filtered
  by room or period: active/pending activation residents and guards, and active/
  inactive parcel rooms. Account-state history is not reconstructed.

Room filtering uses current parcel assignments, not historical room movements.
Deleted parcels/disputes are excluded. Reads share a repeatable-read, read-only
snapshot; local inclusive days use half-open timestamp ranges.

## Interaction and PDF
Plots support pointer/touch and arrow/Home/End/Escape keyboard inspection with
text values. Stale requests are aborted; export is disabled while a selected
filter is pending or errored. Retry retains filters. Custom dates require Apply.
The rate meter has an accessible empty state and reduced-motion support.

Generate Report opens a native focus-trapped dialog seeded from the selected
dates/room. Types: Full analytics, Parcel, Dispute, System summary. The PDF uses
the same validated server-side calculations, with period, room, generation time,
page numbers and data-coverage notes. Escape, return focus, busy submission
protection and retry errors are supported. All exports are Admin-only and
`private, no-store`. No migrations, live notifications or account writes occur.
Existing dashboard and legacy report endpoints remain unchanged.

GET `/api/dashboard/admin/analytics`: from, to, room_id, group (day/week/month).
GET `/api/dashboard/admin/analytics/report`: same filters plus report_type
(full/parcels/disputes/system), returning a PDF attachment.

## Verification
`backend/tests/admin-analytics.test.js` uses rollback-only DB/PDF fixtures with
ADMIN_ANALYTICS_INTEGRATION=true. `frontend/tests/analytics.test.js` covers
presets, validation and scales. `frontend/tests/analytics.browser.mjs` checks
desktop/tablet/mobile charts, controls, PDF selection/download, stale reads,
errors, empty states and role access using intercepted data and no live writes.
