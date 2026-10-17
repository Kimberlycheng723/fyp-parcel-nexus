# Shared Workspace Appearance

The signed-in `ProtectedLayout` uses `parcel-workspace-shell` for every role and
page. `workspace-shell.css` owns the floating sidebar, GEMS/role header, navigation
states, profile/unit footer, collapse control, mobile drawer and shared canvas.
It is imported after the page styles. Sidebar rules were moved from the Admin
dashboard stylesheet, not duplicated. Admin dashboard widget rules remain scoped
to `admin-dashboard-shell` and `adm-` components.

Page layouts, component sizing and workflows remain owned by their existing
modules. The shared theme supplies DM Sans, ink, muted text, borders, surfaces,
focus indicators and action colours without inheriting Admin content padding.
Analytics and Reporting is an Admin-only addition; Super
Admin still has no analytics, Audit Trail, Disputes, Parcel Rooms or Parcel Trace links.
Residents retain their unit footer; its full unit code is also available as a
tooltip when the rail is collapsed. Logout confirmation and mobile Escape/close
behavior reuse the existing handlers. Collapse motion respects reduced motion.

The shared appearance applies only to signed-in workspaces. Login, activation,
forgot/reset password and other public auth screens retain their separate design.
No backend, environment, database or API changes are required.

Every signed-in page uses WorkspaceHeader through ProtectedLayout. It shows a
condo icon and GEM Residences identity, Command+K/Ctrl+K search, a theme switch
beside search and one notification bell.
The header has no Workspace breadcrumb, export action or profile avatar. Menu
opening is integrated into this header on phones/tablets rather than a second
mobile toolbar. The page name remains the semantic H1 for assistive technology
but is visually hidden. Old page-specific bells, category/breadcrumb labels and duplicate
title/description blocks are removed. Existing page actions, form steps,
record-specific headings and success/error states remain. Action-only rows
retain Add Parcel Room, Export CSV, New Conversation and related controls.
Admin, Guard and Resident dashboards restore their time-based, personalized
greeting above their existing content; analytics does not show a greeting.
Report export remains available in the Analytics and Reporting content only.

Search destinations respect roles: Admin/Guard search Parcels, Resident searches
their own parcel dashboard, and Super Admin searches Accounts. useSearchQuery
synchronizes a mounted results page on navigation, including repeated searches
and history changes. Staff parcel header searches use the All registration-date
range so older parcels are not hidden. Existing role authorization is unchanged.

The header identity uses DM Sans 16px/400, a 21px Lucide Building2 icon and a
short vertical divider, following the supplied residence reference. Its surface
follows the selected theme. It has no datetime. The live Malaysia weekday,
date and time are aligned to the far right of the dashboard greeting row,
with a responsive wrap on phones. The greeting uses the ZIP's Outfit/500
headline size (30px desktop, 26px tablet, 25px phone).
It is a compact 64px desktop band with square corners, no bottom
margin and an inset 1px lower rule (28px
desktop gutters, 14px mobile gutters). Its content surface joins directly below it,
instead of appearing as a separate floating pill. Dashboard top rounding is
removed to keep this connection consistent with the other signed-in pages.
On desktop the sidebar floats 12px from the left, top and bottom edges, with
a thin neutral border, 12px corners and a subtle theme-aware shadow. Its width
remains 226px (80px collapsed), with a 250px (104px collapsed) grid track reserving
the surrounding gaps. A 44px hamburger button beside GEMS replaces the condo
brand mark and the outside collapse arrow. It remains available at the top of
the collapsed icon rail, with an action tooltip and accessible expanded state,
and the resident selection bar follows the reserved track. Expanded/collapsed
preference and navigation motion remain unchanged; icon-only items have hover
titles. The header starts at the top edge and internal content gutters remain.
The mobile drawer remains full-height with square corners and existing dismissal.
Workspace gutters are shared while page-specific typography is preserved. On
desktop the identity, search, theme switch and bell occupy one row; narrow
screens place search and its adjacent theme switch under the identity/menu/bell
row. Profile and unit information remain in the sidebar.

Admin, Guard and Resident menus are flat lists without category headings or
group gaps. Admin order is Dashboard, Parcels, Disputes, Parcel Trace, Accounts,
Analytics and Reporting, Audit Trail, Parcel Rooms, Settings, Profile, Logout. Guard and Resident keep
their existing item order and role-specific links. Super Admin grouping is
unchanged. Settings retains its existing placeholder behavior.

The supplied Parcelroom ZIP is the visual reference for branding, active-nav
motion and typography. GEMS uses its Outfit/500 brand role at 23px (21px at
561-900px), beside the desktop hamburger control. Admin's role badge is removed;
other role badges and the footer's identity/role information remain.
The Parcels menu uses Lucide Package's taped-box silhouette at the reference
19px size, with a stronger 1.9 stroke weight for legibility. Navigation labels
use 13px/500 (600 for the selected item). No new icon dependency is introduced.

One liquid-nav-indicator sits behind the active button. Its 8px radius follows
the neutral Studio-style navigation; the 320ms transform/height transition and
cubic-bezier(.22,1,.36,1) easing still match liquid.css. Its light-grey selection
surface uses dark text and icons against the white sidebar.
useSidebarIndicator carries
the visible position briefly between page-shell remounts, including StrictMode
effect replay and interrupted navigation. It observes resize/font changes,
cleans up listeners/observers and disables spatial transitions for reduced
motion. Active items expose aria-current=page. Collapse preference uses
sessionStorage, preserving the narrow rail when navigating between pages.

## Workspace Palette and Outlined Cards
All signed-in roles use a white #FFFFFF canvas, sidebar, header and content
cards, following the supplied YouTube Studio reference. Cards are flat with
thin #E0E0E0 outlines rather than raised shadows. Navigation labels use #212121;
secondary labels use #606060. The sliding selection uses the login page's
lavender #E8EDFA with #2547CE active text and icons; sidebar hover stays #F2F2F2.
Dark mode retains its charcoal selection and white active text/icons.
Indigo #3639F5 remains the product's
primary action and focus colour, with #2B2ED0 for action hover. Headings and body
ink use #0F0F0F. Header/sidebar dividers use #E5E5E5 and search uses #F7F7F7.

The four parcel summary cards use neutral theme surfaces with blue #4263C7
(registered), teal #1B7A68 (collected), amber #936014 (awaiting) and rose #B44762
(overdue) numbers/icons. Dark mode uses lighter accents on its neutral surfaces.
The room chart uses muted gold #EFC579 for awaiting collection and dusty rose
#CC718D for overdue, including legend and tooltip swatches. Counts use dark
#3C252B text in both themes. Summary hover effects and navigation motion remain unchanged.
Interactive card outlines darken to #BDBDBD on hover without elevation. Existing
table headings, form cards, selected states and primary/secondary buttons reuse
the palette while retaining their page-specific sizing. Semantic warning,
success, destructive and error treatments remain distinct.

Tokens are scoped to parcel-workspace-shell and workspace-theme-surface.
The latter also themes report and dispute dialogs rendered through portals,
without changing their functional backdrop dimming. Login and public auth
remain unchanged. Unframed page sections stay unframed.

The system-wide palette rollout has not had a new browser or build run;
validation remains deferred at the user's request. Results below describe
earlier layout validation, not verification of this palette.

## Optional Dark Mode
Every role has a keyboard-accessible sun/moon Dark mode switch in the top bar,
beside search. It has a 44px target, action tooltip and accessible switch state,
and stays available when the sidebar is collapsed or closed on mobile. The
sidebar no longer duplicates the switch. Light mode remains the default. The preference is
stored in localStorage under `parcel_nexus_theme:<user_id>`, so navigation and
reloads retain it without sharing choices between accounts on one browser.
Storage events synchronize the same account's choice across open tabs. If
storage is blocked, switching still works on the current page without an error.

`useWorkspaceTheme` applies a document attribute before paint while a signed-in
layout is mounted, and removes it when that layout unmounts. `workspace-theme.css`
uses that attribute only for signed-in theme surfaces, including portal dialogs
and notification toasts. Public login and account activation/reset screens keep
their existing light appearance. Dark surfaces use charcoal with light text,
neutral outlines and neutral summary cards with coloured numbers/icons. QR codes and
original evidence images are not inverted or filtered.

Existing page colour declarations use dark-only CSS variables with their
original light colours as fallbacks. This preserves light mode while covering
forms, tables, menus, native dialogs, chart labels and responsive page layouts.
The focused preference tests are in `workspace-theme.test.js`; execution and
browser/build validation remain deferred along with the prior visual trials.

Validation is covered by `workspace-shell.browser.mjs` (all four roles at desktop,
tablet and mobile widths, with intercepted API fixtures) and the existing Admin
dashboard suite. The shared checks verify role navigation, the canvas,
the sole shared Profile heading, collapse/expand, drawer closing, logout cancellation,
resident unit information, overflow and auth-page isolation.

Header validation uses workspace-header.test.js and workspace-header.browser.mjs:
page names, all signed-in routes at 1440/834/390px, single-bell/absent-avatar
rules, keyboard search, safe role-scoped handoff, repeated same-page searches,
notification navigation and absence of write requests. Public auth screens do
not receive this header. Dashboard/analytics regression checks retain report
export from analytics content while verifying that dashboard/header export is gone.
The completed dashboard run passed 86 dashboard/analytics scenarios. The header
suite also checks compact height, square bottom corners and no content gap on
every signed-in route and viewport. The shared-chrome run passed 126 header scenarios,
12 shared-sidebar scenarios and 11 unit tests. Desktop and phone captures were
inspected; the search focus ring is applied once to the outer field. The
production build and whitespace check passed. Tests used intercepted API
fixtures and did not modify live account, parcel or notification data.
