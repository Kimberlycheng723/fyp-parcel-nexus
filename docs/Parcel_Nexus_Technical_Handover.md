# Parcel Nexus Technical Handover Document

Project: **Parcel Nexus**  
Description: **Web-Based Parcel Management System for GEM Condominium**  
Stack: **PostgreSQL, Express.js, React, Node.js, Docker Compose**

This handover explains the implemented system as inspected from the current codebase. It is written for FYP viva preparation and future maintenance. It does not include private environment values, passwords, tokens, or secrets.

## 1. Project Overview

Parcel Nexus is a web-based parcel management system for GEM Condominium. It digitalises condominium parcel-room operations that would otherwise be handled through paper logbooks or informal manual tracking.

The main problem it solves is parcel visibility. Guards need to log parcels accurately, Admin needs to monitor parcel operations, Residents need to see their own parcels only, and Super Admin needs to manage high-level system ownership without being involved in daily parcel operations.

Main users:

| Role | Main purpose |
| --- | --- |
| Super Admin | System owner role that manages Admin accounts only. |
| Admin | Manages users, parcels, dashboard reporting, and operational oversight. |
| Guard | Logs parcels, views parcel records, edits operational parcel details, and manages courier names during registration. |
| Resident | Views parcels belonging only to their own unit. |

Main workflow:

1. Super Admin seeds or creates Admin accounts.
2. Admin creates Guard and Resident accounts.
3. Resident accounts are linked to condominium units.
4. Guard logs parcels by selecting courier, delivery contact, unit, tracking number, and optional parcel photo.
5. Parcel records start as `PENDING_COLLECTION`.
6. Admin and Guard view/manage parcel records.
7. Resident sees only their own unit parcels.
8. Dashboard and report exports reflect real database records.

This is useful for GEM Condominium because it provides centralised parcel records, role-based access control, safer resident privacy, operational dashboards, and exportable system reports.

## 2. System Roles and Responsibilities

### Super Admin

What Super Admin can do:

- Manage Admin accounts through the Accounts page.
- View and update own profile.
- Change password through registered email reset flow.

What Super Admin cannot do:

- Cannot use normal parcel operations.
- Cannot access Admin, Guard, or Resident dashboards.
- Cannot register parcels.
- Cannot manage parcel records.
- Cannot generate dashboard reports.

Main pages:

- `/accounts`
- `/profile`

Important restrictions:

- Super Admin is redirected to `/accounts` instead of `/dashboard`.
- Super Admin manages only `ADMIN` accounts.
- Notification Preferences are hidden from Super Admin profile.

### Admin

What Admin can do:

- Access Admin Dashboard.
- Manage Guard and Resident accounts.
- View parcel records.
- Edit parcel records.
- Soft-delete parcel records.
- Export parcel CSV from Parcel Management.
- Generate Dashboard Summary Report from Admin Dashboard.
- View and update own profile.

What Admin cannot do:

- Cannot create or manage Super Admin accounts.
- Cannot create another Admin account; that is Super Admin's role.
- Cannot access Resident-only parcel APIs.
- Cannot access Guard-only dashboard endpoint.

Main pages:

- `/dashboard`
- `/accounts`
- `/parcels`
- `/profile`

### Guard

What Guard can do:

- Access Guard Dashboard.
- Log/register new parcels.
- Upload or capture parcel photos.
- View parcel records.
- Edit parcel records.
- Add courier companies during parcel registration.
- Edit courier companies.
- View and update own profile.

What Guard cannot do:

- Cannot delete parcel records.
- Cannot export Parcel Management CSV.
- Cannot generate Admin reports.
- Cannot manage user accounts.
- Cannot access Resident-only parcel APIs.

Main pages:

- `/dashboard`
- `/parcels`
- `/parcels/new`
- `/profile`

Important workflow decision:

- Guards are general parcel-room operational staff.
- The previous `assigned_post` concept was removed. Guards are not permanently assigned to one block, tower, or post.

### Resident

What Resident can do:

- Access Resident Dashboard / My Parcels page.
- View own unit parcel summary.
- View own pending and overdue parcels.
- View own collected parcel history.
- Search own parcel records.
- Select pending parcels for the future QR collection flow.
- View and update own profile.

What Resident cannot do:

- Cannot see parcels from other units.
- Cannot register parcels.
- Cannot edit parcel records.
- Cannot manage accounts.
- Cannot access Admin or Guard dashboards.

Main pages:

- `/dashboard`
- `/profile`

Important restrictions:

- Resident parcel APIs require `RESIDENT`.
- Resident parcel queries always join through `users.unit_id`.
- If a parcel belongs to another unit, resident detail lookup returns not found.

## 3. System Architecture

Parcel Nexus uses a standard three-tier web architecture:

```text
Browser
  -> React/Vite Frontend
  -> Express.js Backend API
  -> PostgreSQL Database
```

Frontend:

- Built with React and Vite.
- Runs at `http://localhost:5173` in development.
- Calls backend APIs using `fetch` through `frontend/src/services/api.js`.
- Stores JWT access token in local storage using `frontend/src/services/tokenStorage.js`.

Backend:

- Built with Express.js and Node.js.
- Runs at `http://localhost:5000`.
- Mounts APIs under `/api`.
- Uses PostgreSQL through the `pg` library.
- Uses JWT Bearer authentication.

Database:

- PostgreSQL stores users, units, parcels, courier companies, activation/reset tokens, and early collection schema.

Docker Compose containers:

| Container | Purpose |
| --- | --- |
| `parcel_nexus_frontend` | React/Vite frontend development server. |
| `parcel_nexus_backend` | Express backend API server. |
| `parcel_nexus_postgres` | PostgreSQL 16 database. |

The Docker Compose file is `docker-compose.yml`. The backend service mounts `./backend:/app` and uses a named `backend_node_modules` volume. The frontend mounts `./frontend:/app/frontend` and uses `frontend_node_modules`.

## 4. Project Folder Structure

### Frontend

| Path | Purpose |
| --- | --- |
| `frontend/src/pages` | Main page components such as login, dashboard, accounts, parcel registration, parcel management, and profile. |
| `frontend/src/components` | Shared UI/layout components such as protected layout, route guard, password field, auth layout, and spinner. |
| `frontend/src/context` | Authentication context and session handling. |
| `frontend/src/hooks` | Shared React hooks such as resend cooldown timer. |
| `frontend/src/services` | API helper and token storage. |
| `frontend/src/styles` | Custom CSS split by page/module. |
| `frontend/src/utils` | Navigation helpers and role landing route helper. |
| `frontend/index.html` | Vite HTML entry. |
| `frontend/vite.config.js` | Vite server/plugin configuration. |
| `frontend/package.json` | Frontend scripts and dependencies. |

### Backend

| Path | Purpose |
| --- | --- |
| `backend/src/controllers` | Express request/response handlers. |
| `backend/src/services` | Business logic and database queries. |
| `backend/src/routes` | Express route definitions and middleware wiring. |
| `backend/src/middleware` | Authentication, role, and upload middleware. |
| `backend/src/db` | Database pool, migrations, seed script, activation token helper. |
| `backend/src/utils` | JWT, password, token, validation, and async helpers. |
| `backend/src/app.js` | Express app setup and route mounting. |
| `backend/src/server.js` | Starts the backend server. |
| `backend/uploads/parcels` | Local development parcel image storage. |
| `backend/package.json` | Backend scripts and dependencies. |

### Root

| Path | Purpose |
| --- | --- |
| `docker-compose.yml` | Defines frontend, backend, and PostgreSQL containers. |
| `.env` | Local private runtime configuration. Do not commit or expose. |
| `.env.example` | Example environment variable names and placeholder values. |
| `.gitignore` | Prevents committing generated/private files. |
| `README.md` | Short setup overview. |
| `package.json` | Root workspace scripts. |

## 5. Frontend Pages and Functions

| Page/component | File path | Purpose | Main functions/features | Roles using it |
| --- | --- | --- | --- | --- |
| LoginPage | `frontend/src/pages/LoginPage.jsx` | Sign in users. | Validates email/password, calls `/auth/login`, redirects by role, shows expired session notice. | All roles |
| ForgotPasswordPage | `frontend/src/pages/ForgotPasswordPage.jsx` | Request reset email. | Calls forgot password API, shows loading state, success message, 60-second resend cooldown. | Public |
| ResetPasswordPage | `frontend/src/pages/ResetPasswordPage.jsx` | Reset password from email token. | Validates password confirmation, calls `/auth/reset-password`, redirects to `/login` after success. | Public |
| ActivateAccountPage | `frontend/src/pages/ResetPasswordPage.jsx` | Activate new account. | Uses activation token and password form. | New invited users |
| DashboardPage | `frontend/src/pages/DashboardPage.jsx` | Role-based dashboard router. | Admin dashboard, Guard dashboard, Resident My Parcels page, charts, report modal, QR placeholder. | Admin, Guard, Resident |
| AccountsPage | `frontend/src/pages/AccountsPage.jsx` | User/account management. | Create/edit/view/deactivate/reactivate accounts, resend activation, export visible accounts CSV. | Super Admin, Admin |
| ParcelRegistrationPage | `frontend/src/pages/ParcelRegistrationPage.jsx` | Two-step parcel registration. | Courier selection/add/edit, phone contact, unit search, tracking input, photo upload/camera, session list, finish registration. | Guard |
| ParcelManagementPage | `frontend/src/pages/ParcelManagementPage.jsx` | Parcel records page. | Summary cards, search/filter/date filter, table/card responsive layouts, view/edit/delete, Admin CSV export. | Admin, Guard |
| ProfilePage | `frontend/src/pages/ProfilePage.jsx` | User profile and settings. | View/edit profile, password reset email modal, notification preference placeholder except Super Admin. | All roles |
| ProtectedLayout | `frontend/src/components/ProtectedLayout.jsx` | Authenticated shell. | Sidebar, mobile drawer, role menu, notification icon, logout confirmation. | All authenticated roles |
| ProtectedRoute | `frontend/src/components/ProtectedRoute.jsx` | Route guard. | Redirects unauthenticated users to `/login`. | All protected pages |
| AuthContext | `frontend/src/context/AuthContext.jsx` | Auth/session state. | Stores user/token, refreshes `/auth/me`, auto logout timer from JWT `exp`, handles 401 session expiry. | Whole frontend |
| api.js | `frontend/src/services/api.js` | API wrapper. | Adds Bearer token, sends JSON/FormData, downloads blobs, dispatches session-expired event on 401. | Whole frontend |
| tokenStorage.js | `frontend/src/services/tokenStorage.js` | Token storage helper. | Reads/writes/removes JWT access token from localStorage. | Auth |
| roleLanding.js | `frontend/src/utils/roleLanding.js` | Role default route helper. | Sends Super Admin to `/accounts`, other roles to `/dashboard`. | Login/routing |
| navigation.js | `frontend/src/utils/navigation.js` | Lightweight router helper. | `navigate`, `replaceNavigate`, current path, query param parsing. | Whole frontend |
| useResendCooldown | `frontend/src/hooks/useResendCooldown.js` | Countdown hook. | 60-second resend timer with cleanup. | Forgot password, profile password email modal |

Important frontend features:

- Login/logout: login stores JWT token; logout clears token and redirects to login after confirmation.
- Session expiry auto logout: frontend decodes JWT `exp` and sets a timeout; API 401 also clears session.
- Role-based landing route: `SUPER_ADMIN -> /accounts`, other roles -> `/dashboard`.
- Sidebar role-based menu: `ProtectedLayout.jsx` defines menu groups per role.
- Mobile responsive layout: custom CSS in `frontend/src/styles`.
- Dashboard charts: custom SVG line chart and donut chart in `DashboardPage.jsx`.
- Generate Report modal: Admin-only; frontend shows Dashboard Summary Report only.
- Parcel Management mobile cards: phone layout renders parcel records as stacked cards.
- Resident parcel selection: pending parcels can be selected for future QR collection; QR generation is placeholder only.
- Profile password reset email flow: profile no longer directly changes password; it sends reset email to registered email.
- Forgot password resend cooldown: button shows `Sending...`, then `Resend email in 60s`.

## 6. Backend Routes, Controllers, and Services

| Module | Route file | Controller file | Service file | Main endpoints | Purpose |
| --- | --- | --- | --- | --- | --- |
| Auth | `backend/src/routes/auth.routes.js` | `backend/src/controllers/auth.controller.js` | `backend/src/services/auth.service.js`, `activation.service.js`, `passwordReset.service.js` | `/api/auth/login`, `/activate`, `/forgot-password`, `/reset-password`, `/me`, `/logout` | Login, activation, reset password, current user. |
| Users/accounts | `backend/src/routes/user.routes.js` | `backend/src/controllers/user.controller.js` | `backend/src/services/user.service.js` | `/api/users` | Account management with role rules. |
| Profile | `backend/src/routes/profile.routes.js` | `backend/src/controllers/profile.controller.js` | `backend/src/services/profile.service.js` | `/api/profile` | Own profile view/update and legacy direct password endpoint. |
| Dashboard/report | `backend/src/routes/dashboard.routes.js` | `backend/src/controllers/dashboard.controller.js` | `backend/src/services/dashboard.service.js` | `/api/dashboard/admin`, `/api/dashboard/guard`, `/api/dashboard/admin/reports/export` | Admin dashboard, Guard dashboard, report export. |
| Parcel registration | `backend/src/routes/parcelRegistration.routes.js` | `backend/src/controllers/parcelRegistration.controller.js` | `backend/src/services/parcelRegistration.service.js` | `/api/parcel-registration/photos`, `/api/parcel-registration/sessions` | Upload parcel photos and register parcel sessions. |
| Parcel management | `backend/src/routes/parcel.routes.js` | `backend/src/controllers/parcel.controller.js` | `backend/src/services/parcel.service.js` | `/api/parcels/*` | List, view, edit, soft-delete, export parcel records. |
| Resident parcels | `backend/src/routes/residentParcel.routes.js` | `backend/src/controllers/residentParcel.controller.js` | `backend/src/services/residentParcel.service.js` | `/api/resident/parcels/*` | Resident own-unit parcel summary/list/details. |
| Courier companies | `backend/src/routes/courier.routes.js` | `backend/src/controllers/courier.controller.js` | `backend/src/services/courier.service.js` | `/api/couriers` | List, add, edit courier companies. |
| Units | `backend/src/routes/unit.routes.js` | `backend/src/controllers/unit.controller.js` | `backend/src/services/unit.service.js` | `/api/units/search` | Unit search and unit creation helper. |
| Health check | `backend/src/routes/health.routes.js` | inline route handlers | `backend/src/db/pool.js` | `/api/health`, `/api/health/db` | Backend and database health checks. |

Route files define HTTP paths and attach middleware. Controllers validate request shape, map service error codes to HTTP messages, and return JSON/download responses. Services contain database queries and business rules.

Important business rules:

- `requireAuth` validates Bearer JWT and ensures the user is active.
- `requireRole` blocks routes by role.
- User service has additional role-management rules:
  - Super Admin can manage Admin accounts.
  - Admin can manage Guard and Resident accounts.
- Parcel service allows Admin and Guard to view/edit, but only Admin can delete/export.
- Resident parcel service scopes all records to the authenticated resident's `unit_id`.
- Dashboard service uses Malaysia business-day boundaries for dashboard/report periods.

## 7. API Endpoint Summary

### Auth

| Method | Path | Access role | Purpose | Important request fields | Important response fields |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | Login. | `email`, `password` | `accessToken`, `user` |
| POST | `/api/auth/activate` | Public | Activate invited account. | `token`, `newPassword` | `message` |
| POST | `/api/auth/forgot-password` | Public | Send reset email. | `email` | Generic message; development token if dev mode |
| POST | `/api/auth/reset-password` | Public | Reset password. | `token`, `newPassword` | `message` |
| GET | `/api/auth/me` | Authenticated | Get current safe user. | Bearer token | `user` |
| POST | `/api/auth/logout` | Authenticated | Client-side logout acknowledgement. | Bearer token | `message` |

### Profile

| Method | Path | Access role | Purpose | Important request fields | Important response fields |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/profile` | Authenticated | Get own profile. | Bearer token | `profile` |
| PUT | `/api/profile` | Authenticated | Update own profile. | `email`, `phone_number`, `first_name`, `last_name` | `profile` |
| POST | `/api/profile/change-password` | Authenticated | Legacy direct password change endpoint. Frontend currently uses reset email flow instead. | `currentPassword`, `newPassword` | `message` |

### User/account management

| Method | Path | Access role | Purpose | Important request fields | Important response fields |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/users` | Super Admin/Admin by service rule | Create managed account. | `role`, `email`, `phone_number`, names for Admin/Guard, unit for Resident | `user`, activation email metadata |
| GET | `/api/users` | Super Admin/Admin by service rule | List managed accounts. | `role`, `status`, `search`, `page`, `limit` | `users`, `pagination` |
| GET | `/api/users/:userId` | Super Admin/Admin by service rule | Get account details. | `userId` | `user` |
| PUT | `/api/users/:userId` | Super Admin/Admin by service rule | Update managed account. | email/phone/name/unit depending on role | `user` |
| PATCH | `/api/users/:userId/status` | Super Admin/Admin by service rule | Deactivate/reactivate account. | `status` | `user` |
| POST | `/api/users/:userId/resend-activation` | Super Admin/Admin by service rule | Resend activation email. | `userId` | `message`, email metadata |

### Dashboard and reports

| Method | Path | Access role | Purpose | Important request fields | Important response fields |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/dashboard/admin` | Admin | Admin dashboard data. | `period=day/week/month`, `start_date=YYYY-MM-DD` | `kpis`, `parcel_trend`, `status_distribution`, `system_summary`, `recent_activity` |
| GET | `/api/dashboard/guard` | Guard | Guard dashboard data. | `period=today/day/week/month`, `start_date=YYYY-MM-DD` | `summary`, `latest_logged_parcels`, `pending_collection_parcels` |
| GET | `/api/dashboard/admin/reports/export` | Admin | Export report file. | `report_type`, `format`, `period`, `start_date` | CSV/PDF attachment |

### Parcel registration

| Method | Path | Access role | Purpose | Important request fields | Important response fields |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/parcel-registration/photos` | Admin, Guard | Upload parcel photo. | multipart `photo` | `parcel_photo_url`, file metadata |
| POST | `/api/parcel-registration/sessions` | Guard | Register one or more parcels in a session. | `courier_id`, `delivery_person_contact`, `parcels[]` | `summary`, `parcels` |

### Parcel management

| Method | Path | Access role | Purpose | Important request fields | Important response fields |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/parcels/summary` | Admin, Guard | Parcel summary cards. | Bearer token | counts |
| GET | `/api/parcels/export` | Admin | Export parcel records as JSON for frontend CSV generation. | filters | parcel export rows |
| GET | `/api/parcels/status-options` | Admin, Guard | Status filter options. | none | statuses |
| GET | `/api/parcels` | Admin, Guard | List parcel records. | `search`, `status`, `date_range`, `page`, `limit`, sort options | `data`, `pagination`, `filters` |
| GET | `/api/parcels/:parcelId` | Admin, Guard | View parcel detail. | `parcelId` | `parcel` |
| PATCH | `/api/parcels/:parcelId` | Admin, Guard | Edit parcel detail. | tracking/courier/unit/contact/photo/deadline | `parcel` |
| PATCH | `/api/parcels/:parcelId/status` | Admin, Guard | Update stored status. | `status` | `parcel` |
| DELETE | `/api/parcels/:parcelId` | Admin | Soft-delete parcel. | `parcelId` | `message`, `parcel` |

### Courier companies

| Method | Path | Access role | Purpose | Important request fields | Important response fields |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/couriers` | Admin, Guard | List active couriers. | none | `couriers` |
| POST | `/api/couriers` | Guard | Add courier. | `courier_name`, `courier_code`, `contact_number`, `badge_color` | `courier` |
| PUT | `/api/couriers/:courierId` | Admin, Guard | Edit courier. | `courier_name`, `courier_code`, `contact_number`, `badge_color` | `courier` |

### Resident parcels

| Method | Path | Access role | Purpose | Important request fields | Important response fields |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/resident/parcels/summary` | Resident | Own unit parcel summary. | Bearer token | `summary`, `unit` |
| GET | `/api/resident/parcels` | Resident | Own parcel list. | `tab=pending/history`, `search`, `page`, `limit` | `items`, `pagination` |
| GET | `/api/resident/parcels/:parcelId` | Resident | Own parcel detail. | `parcelId` | `parcel` |

### Units and health

| Method | Path | Access role | Purpose |
| --- | --- | --- | --- |
| GET | `/api/units/search` | Admin, Guard | Search units for registration/account workflows. |
| GET | `/api/health` | Public | Backend health check. |
| GET | `/api/health/db` | Public | Database connectivity check. |

## 8. Database Design and Tables

The database schema is defined by SQL migrations in `backend/src/db/migrations`.

### units

Purpose: Stores condominium unit records.

Important columns:

- `unit_id`: UUID primary key.
- `block`: Block/tower code.
- `floor`: Floor.
- `unit_number`: Unit number.
- `full_unit_code`: Full display code such as `GC1-08-07`.
- `created_at`, `updated_at`.

Constraints:

- `full_unit_code` is unique.

Relationships:

- `users.unit_id` references `units.unit_id` for Resident accounts.
- `parcels.unit_id` references `units.unit_id`.

### users

Purpose: Stores system accounts.

Important columns:

- `user_id`: UUID primary key.
- `email`: unique login email.
- `password_hash`: bcrypt password hash.
- `first_name`, `last_name`.
- `phone_number`.
- `role`: `SUPER_ADMIN`, `ADMIN`, `GUARD`, `RESIDENT`.
- `unit_id`: nullable FK to units. Required only for Residents.
- `created_by`: FK to user who created the account.
- `status`: `PENDING_ACTIVATION`, `ACTIVE`, `DEACTIVATED`.
- `created_at`, `updated_at`.

Constraints:

- Email unique.
- Role check constraint.
- Status check constraint.
- Resident unit check: Resident must have `unit_id`; non-residents must not.
- Unique partial index allows only one pending/active Resident account per unit.

Security:

- Password hashes are never exported in reports or safe API responses.
- Activation/reset tokens are stored separately as hashes.

### courier_companies

Purpose: Stores courier companies used during parcel registration.

Important columns:

- `courier_id`: UUID primary key.
- `courier_name`: display name.
- `courier_code`: short code used in badges.
- `contact_number`: optional contact.
- `badge_color`: safe preset hex color.
- `status`: currently `ACTIVE` or `INACTIVE`.
- `created_by`: FK to creator.
- `created_at`, `updated_at`.

Constraints:

- Case-insensitive unique index on courier name.
- Case-insensitive unique index on courier code when code exists.
- Badge color is restricted to safe preset hex values.

### parcels

Purpose: Stores parcel records.

Important columns:

- `parcel_id`: UUID primary key.
- `tracking_number`: courier tracking/barcode number.
- `courier_id`: FK to courier company.
- `unit_id`: FK to unit.
- `registered_by`: FK to user who logged the parcel.
- `delivery_person_contact`.
- `parcel_photo_url`.
- `status`: final schema uses `PENDING_COLLECTION`, `COLLECTED`, `CANCELLED`.
- `collection_deadline`.
- `collected_at`.
- `deleted_at`: soft delete marker.
- `deleted_by`: user who deleted.
- `created_at`, `updated_at`.

Important constraints:

- `parcel_id` is the primary key.
- `tracking_number` is not the primary key because different courier companies may use the same tracking number format.
- Active duplicate tracking is prevented by partial unique index:
  - `courier_id + LOWER(tracking_number)` where `deleted_at IS NULL`.

### parcel_collections

Purpose: Early database foundation for QR collection flow.

Important columns:

- `collection_id`: UUID primary key.
- `resident_id`: FK to user.
- `verified_by`: FK to user, nullable.
- `qr_token_hash`: unique token hash.
- `qr_expiry`.
- `collection_status`: `ACTIVE`, `USED`, `EXPIRED`, `CANCELLED`.
- `generated_at`, `collected_at`, timestamps.

Implementation status:

- Table exists.
- Full QR/collection verification flow is not implemented yet in the application UI/API.

### parcel_collection_items

Purpose: Join table between collection sessions and parcels.

Important columns:

- `collection_item_id`: UUID primary key.
- `collection_id`: FK to `parcel_collections`.
- `parcel_id`: FK to `parcels`.
- `created_at`.

Constraints:

- Unique pair `(collection_id, parcel_id)`.

Implementation status:

- Table exists for future collection module.

### account_activation_tokens

Purpose: Stores account activation tokens as hashes.

Important columns:

- `token_id`: UUID primary key.
- `user_id`: FK to users.
- `token_hash`: unique hash.
- `expires_at`.
- `used_at`.
- `created_at`.

Security:

- Raw activation tokens are not stored.
- Tokens expire after 30 days.

### password_reset_tokens

Purpose: Stores password reset tokens as hashes.

Important columns:

- `token_id`: UUID primary key.
- `user_id`: FK to users.
- `token_hash`: unique hash.
- `expires_at`.
- `used_at`.
- `created_at`.

Security:

- Raw reset tokens are not stored.
- Tokens expire after 15 minutes.
- Same-password reset is rejected before password update.

### Tables not found in current migrations

The current migrations do not create these tables:

- `notifications`
- `audit_logs`
- `disputes`
- migration tracking table such as `schema_migrations`

The migration runner reads and executes all `.sql` files in sorted order. The SQL files use idempotent patterns where needed, but there is no separate migration history table in the inspected code.

## 9. Database Relationships

Key relationships:

- Resident user links to one unit using `users.unit_id`.
- Parcel links to one unit using `parcels.unit_id`.
- Parcel links to one courier using `parcels.courier_id`.
- Parcel links to registering user using `parcels.registered_by`.
- Soft-deleted parcel optionally links to deleting user using `parcels.deleted_by`.
- Activation token links to user using `account_activation_tokens.user_id`.
- Password reset token links to user using `password_reset_tokens.user_id`.
- Future collection record links to Resident and Guard/Admin verifier through `parcel_collections`.
- Future collection item links collection records to parcels through `parcel_collection_items`.

Why `parcel_id` is the primary key:

- It is a stable internal UUID generated by the database.
- It avoids depending on external courier tracking formats.
- It remains unique even if two couriers use the same tracking number text.

Why `tracking_number` is not the primary key:

- Tracking numbers are external business identifiers.
- The same text can legally appear under different courier companies.
- The correct uniqueness rule is active `courier_id + lower(tracking_number)`.

Why duplicate tracking is checked using courier and tracking:

- `DHL + TEST123` and `SPX + TEST123` can both exist.
- `DHL + TEST123` cannot exist twice unless the old record is soft-deleted.
- The database index and backend service both check active records only (`deleted_at IS NULL`).

Why `assigned_post` was removed from Guard:

- In the GEM workflow, guards rotate by shift and are not permanently assigned to one block/post.
- Keeping guard posts would require filtering parcel registration, dashboards, disputes, and collection workflows by post.
- The FYP version treats guards as condominium-level parcel-room operational staff.

## 10. Database Migrations

| Migration file | Purpose | Main schema changes | Why it was needed |
| --- | --- | --- | --- |
| `001_create_fyp1_schema.sql` | Initial schema. | Creates units, users, courier companies, parcels, parcel collection tables, activation tokens, password reset tokens, triggers. | Establishes FYP1 foundation. |
| `002_add_assigned_post_to_users.sql` | Earlier guard post concept. | Adds `assigned_post` to users. | Initially supported fixed guard post assignment. |
| `003_add_courier_registration_fields.sql` | Courier registration improvements. | Adds `courier_code`, courier status, unique indexes, initial tracking unique index. | Supports courier dropdown and courier badge code. |
| `004_parcel_management_fields.sql` | Parcel management enhancements. | Adds collection deadline, soft delete fields, status migration to `PENDING_COLLECTION`, indexes. | Supports parcel management, overdue calculation, soft delete. |
| `005_remove_guard_assigned_post.sql` | Removes guard assigned post. | Drops `assigned_post`. | Aligns with shared guard parcel-room workflow. |
| `006_courier_badge_color_and_tracking_per_courier.sql` | Courier badge color and per-courier tracking uniqueness. | Adds `badge_color`; replaces global tracking uniqueness with partial unique index on `courier_id + LOWER(tracking_number)` for active parcels. | Allows same tracking number under different couriers and color-coded courier badges. |

## 11. Authentication and Security

Authentication uses JWT Bearer tokens.

Backend files:

- `backend/src/utils/jwt.js`
- `backend/src/middleware/auth.middleware.js`
- `backend/src/middleware/role.middleware.js`
- `backend/src/utils/password.js`
- `backend/src/utils/passwordValidation.js`
- `backend/src/services/auth.service.js`
- `backend/src/services/passwordReset.service.js`

Frontend files:

- `frontend/src/context/AuthContext.jsx`
- `frontend/src/services/api.js`
- `frontend/src/services/tokenStorage.js`

Security details:

- Login checks email and bcrypt password hash.
- JWT access token expiry is `1h`.
- Frontend auto logout decodes JWT `exp`, sets a timeout, clears token when expired, redirects to `/login`, and shows session-expired notice.
- `api.js` also handles authenticated API `401` by dispatching a session-expired event.
- `403` permission errors are not treated as expired sessions.
- `requireAuth` validates token and confirms user is still active.
- `requireRole` blocks role-restricted endpoints.
- Passwords are hashed with `bcryptjs`.
- Password validation requires minimum strength.
- Password reset tokens and activation tokens are stored as hashes, not raw tokens.
- Reset password rejects reuse of the current password.
- Logout confirmation modal is handled in `ProtectedLayout.jsx`.
- Helmet is enabled in `backend/src/app.js`.
- CORS is enabled and exposes `Content-Disposition` so downloads can preserve filenames.

## 12. Email System

Email is implemented with `nodemailer` in `backend/src/services/email.service.js`.

Supported email flows:

- Account activation email.
- Forgot password email.
- Profile "Change password" email flow using the registered account email.

How it works:

- Account creation generates an activation token using `activation.service.js`.
- Forgot password generates a reset token using `passwordReset.service.js`.
- Email links point to the frontend URL configured by `FRONTEND_URL`.
- SMTP configuration is read from environment variables.

Relevant environment variable names:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `FRONTEND_URL`

Email sending can take time because SMTP providers perform network communication, authentication, and message handoff. The frontend therefore shows `Sending...` and disables resend buttons while the request is pending.

Resend cooldown:

- Implemented with `frontend/src/hooks/useResendCooldown.js`.
- Used by `ForgotPasswordPage.jsx` and the profile password reset email modal.
- Cooldown duration is 60 seconds.

## 13. File Upload System

Parcel photo upload uses Multer.

Files:

- `backend/src/middleware/upload.middleware.js`
- `backend/src/routes/parcelRegistration.routes.js`
- `backend/uploads/parcels`

How it works:

- Endpoint: `POST /api/parcel-registration/photos`
- Field name: `photo`
- Allowed MIME types: JPG/JPEG, PNG, WEBP.
- Max size: 5 MB.
- Stored locally under `uploads/parcels`.
- API returns `parcel_photo_url`, for example `/uploads/parcels/<filename>`.
- `backend/src/app.js` exposes `/uploads` as a static route.

Why files are not stored in the database:

- Storing file paths/URLs keeps the database smaller.
- The filesystem is more suitable for local development image storage.
- Production could move this to cloud object storage later.

Uploaded files should not be committed to Git. A `.gitkeep` file may be used to keep the upload folder structure.

## 14. Dashboard and Report Generation

### Admin Dashboard

Endpoint: `GET /api/dashboard/admin`

Implemented in `backend/src/services/dashboard.service.js` and `frontend/src/pages/DashboardPage.jsx`.

Sections:

- Summary cards:
  - Parcels Logged
  - Pending Collection
  - Collected Parcels
  - Open Disputes
- Parcels Received Trend line chart.
- Parcel Status Distribution donut chart.
- Dispute Summary.
- System Summary.
- Recent Activity.
- Generate Report modal.

Period behavior:

- `day`: selected local date.
- `week`: rolling 7 local days from selected start date.
- `month`: rolling one local month from selected start date.
- Pending Collection is current/live.
- Open Disputes is current/unavailable because Dispute module is not implemented.

### Guard Dashboard

Endpoint: `GET /api/dashboard/guard`

Sections:

- Parcels Logged.
- Pending Collection.
- Collected Parcels.
- Overdue Parcels.
- Latest Parcels Logged.
- Pending Collection parcels.
- Dispute Summary placeholder.

Period behavior:

- Period affects only activity metrics such as Parcels Logged and Collected Parcels.
- Latest Parcels Logged is true latest activity, not period-filtered.
- Pending Collection and Overdue are current/live counts.

### Resident Dashboard

Resident Dashboard and My Parcels page are the same frontend page.

Endpoints:

- `GET /api/resident/parcels/summary`
- `GET /api/resident/parcels`
- `GET /api/resident/parcels/:parcelId`

Resident data is always scoped to the logged-in user's unit.

### Malaysia timezone/business-day boundary

Dashboard/report period logic uses Malaysia business dates in `dashboard.service.js`.

Important helper logic:

- `BUSINESS_TIME_ZONE = "Asia/Kuala_Lumpur"`
- Local selected dates are converted to UTC timestamps for SQL boundaries.
- Queries use `created_at >= start` and `created_at < end`.

This prevents early-morning Malaysia parcels, such as 1am-3am, from being counted as the previous day because of UTC boundaries.

### Report generation

Endpoint: `GET /api/dashboard/admin/reports/export`

Backend report foundation supports:

- `dashboard_summary`
- `parcel_records`
- `user_account_summary`

Formats:

- CSV
- PDF

Current frontend Generate Report modal only shows:

- Dashboard Summary Report

Reason:

- Parcel Records CSV is exported separately from Parcel Management.

PDF generation:

- Uses `pdfkit`.
- Dashboard Summary PDF includes summary cards, line chart, donut chart, system summary, dispute placeholder, and recent activity.
- Line and donut charts are drawn with PDFKit drawing commands using real dashboard data.

CSV generation:

- Dashboard Summary CSV is section-based:
  - Report Metadata
  - Dashboard Summary
  - Parcels Received Trend
  - Parcel Status Distribution
  - System Summary
  - Dispute Summary
  - Recent Activity

## 15. Courier Company Handling

Courier company handling is part of the parcel registration workflow.

Implemented files:

- Backend: `backend/src/services/courier.service.js`
- Routes: `backend/src/routes/courier.routes.js`
- Frontend: `frontend/src/pages/ParcelRegistrationPage.jsx`

Features:

- Guard can add a courier company.
- Guard/Admin can edit courier company.
- No delete/deactivate UI is implemented.
- Courier code is required.
- Courier code is converted to uppercase.
- Courier name/code uniqueness is checked case-insensitively.
- Badge color uses safe preset hex values.

Badge color:

- Stored in `courier_companies.badge_color`.
- Displayed in courier dropdowns, selected courier summary, Parcel Management, dashboard tables where courier badges are shown, and Resident Dashboard.
- If no color is stored, frontend uses a fallback color.

Tracking number uniqueness:

- Active uniqueness rule is `courier_id + LOWER(tracking_number)`.
- Same tracking text can exist under different couriers.
- Same courier cannot have the same active tracking text twice.
- Soft-deleted parcels do not block reuse.

## 16. Parcel Workflow

1. Super Admin creates Admin accounts or seeds initial Super Admin.
2. Admin creates Guard and Resident accounts.
3. Resident accounts are linked to units through `users.unit_id`.
4. Guard opens Parcel Registration.
5. Guard selects courier and enters delivery person contact.
6. Guard may add/edit courier company if needed.
7. Guard searches/selects unit.
8. Guard enters or scans/types tracking number into the tracking input.
9. Guard optionally uploads or captures a parcel photo.
10. Frontend prevents duplicate tracking in the same registration session.
11. Backend checks full database for active duplicate `(courier_id, tracking_number)`.
12. Parcel is inserted as `PENDING_COLLECTION`.
13. Resident sees parcel under own pending parcels.
14. Admin/Guard can view or edit the parcel in Parcel Management.
15. Admin can soft-delete parcel records.
16. Full QR collection/verification flow is not implemented yet.
17. When collection module is completed, parcel status can become `COLLECTED`.
18. Dashboards and reports reflect updated parcel statuses and counts.

## 17. Role-Based Access Control Details

| Feature/page | Super Admin | Admin | Guard | Resident |
| --- | --- | --- | --- | --- |
| Dashboard | No, redirected to Accounts | Yes | Yes | Yes, own My Parcels dashboard |
| Accounts | Yes, Admin accounts only | Yes, Guard/Resident accounts | No | No |
| Parcel Registration | No | Upload API allowed, session creation Guard-only | Yes | No |
| Parcel Management | No | Yes | Yes, no delete/export | No |
| Reports | No | Yes, Dashboard Summary Report | No | No |
| Resident Parcels | No | No | No | Yes, own unit only |
| Profile | Yes | Yes | Yes | Yes |
| Courier Add/Edit | No | Edit/list allowed, add focused for Guard route | Yes | No |
| Delete Parcel | No | Yes | No | No |
| Export CSV | No | Yes, Parcel Management export | No | No |

Important notes:

- Super Admin is not an operational role.
- Admin Dashboard endpoint requires `ADMIN`.
- Guard Dashboard endpoint requires `GUARD`.
- Resident APIs require `RESIDENT`.
- User management adds service-level role restrictions beyond route authentication.

## 18. Libraries and Dependencies

### Backend dependencies

| Library | Where used | Feature supported | Viva-friendly explanation |
| --- | --- | --- | --- |
| `express` | `backend/src/app.js`, routes | HTTP API server | Provides route handling for frontend API requests. |
| `pg` | `backend/src/db/pool.js`, services | PostgreSQL access | Allows backend to run parameterized SQL queries. |
| `bcryptjs` | `backend/src/utils/password.js` | Password hashing | Stores secure password hashes instead of plain passwords. |
| `jsonwebtoken` | `backend/src/utils/jwt.js` | JWT auth | Creates/verifies Bearer tokens for protected APIs. |
| `nodemailer` | `backend/src/services/email.service.js` | Email sending | Sends activation and password reset emails through SMTP. |
| `multer` | `backend/src/middleware/upload.middleware.js` | File upload | Handles parcel photo uploads safely. |
| `pdfkit` | `backend/src/services/dashboard.service.js` | PDF generation | Creates Dashboard Summary PDF reports server-side. |
| `cors` | `backend/src/app.js` | Cross-origin requests | Allows frontend to call backend API during development. |
| `dotenv` | `backend/src/db/migrate.js`, seed scripts | Environment config | Loads local variables from `.env` for scripts. |
| `helmet` | `backend/src/app.js` | Security headers | Adds safer default HTTP headers. |
| `nodemon` | Backend dev script | Development auto-restart | Restarts backend when files change. |

### Frontend dependencies

| Library | Where used | Feature supported | Viva-friendly explanation |
| --- | --- | --- | --- |
| `react` | Frontend pages/components | UI framework | Builds interactive page components. |
| `react-dom` | `frontend/src/main.jsx` | Browser rendering | Mounts React app into the DOM. |
| `vite` | Frontend build/dev | Development server and build | Fast frontend tooling for React. |
| `@vitejs/plugin-react` | `frontend/vite.config.js` | React support in Vite | Enables React transform/refresh. |
| `lucide-react` | Many pages/components | Icons | Provides consistent UI icons. |
| `react-phone-number-input` | Installed for phone input support | Phone number UI support | Helps with phone number input patterns. |
| `typescript` | Installed | Type tooling available | Project source is mainly JS/JSX; TypeScript is installed but not central. |
| `tailwindcss` | `frontend/tailwind.config.js` | Utility CSS configured | Installed/configured, but project mainly uses custom CSS files. |
| `postcss` | Frontend build CSS pipeline | CSS processing | Used by frontend CSS tooling. |
| `autoprefixer` | Frontend CSS tooling | Browser prefixes | Adds compatible CSS prefixes when needed. |

## 19. Barcode Scanner Status

Search terms checked in the project:

- `barcode`
- `scanner`
- `zxing`
- `html5-qrcode`
- `quagga`
- `camera`
- `getUserMedia`

Result:

- The current project does not use a dedicated barcode scanner library such as ZXing, html5-qrcode, or Quagga.
- Tracking number input is handled through the existing text input flow.
- Parcel Registration includes camera access with `navigator.mediaDevices.getUserMedia`, but this is for parcel photo capture, not barcode decoding.
- Barcode scanning can be added in the future using ZXing or html5-qrcode.

## 20. Configuration and Environment Variables

Configuration is provided by `.env` and `.env.example`. Do not commit real `.env` values.

Important variables:

| Variable | Purpose |
| --- | --- |
| `POSTGRES_DB` | PostgreSQL database name. |
| `POSTGRES_USER` | PostgreSQL username. |
| `POSTGRES_PASSWORD` | PostgreSQL password. |
| `POSTGRES_PORT` | Local PostgreSQL port. |
| `BACKEND_PORT` | Backend API port. |
| `FRONTEND_PORT` | Frontend dev server port. |
| `DATABASE_URL` | Backend PostgreSQL connection string. |
| `FRONTEND_URL` | URL used in activation/reset email links. |
| `VITE_API_BASE_URL` | Frontend API base URL. |
| `JWT_ACCESS_SECRET` | Secret for 1-hour access JWTs. |
| `JWT_RESET_SECRET` | Reserved reset JWT secret variable; reset flow currently uses hashed random tokens. |
| `JWT_ACTIVATION_SECRET` | Reserved activation JWT secret variable; activation flow currently uses hashed random tokens. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP server settings. |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | SMTP authentication/sender settings. |
| `SEED_SUPER_ADMIN_*` | Seed account settings for local Super Admin creation. |
| `DEV_ACTIVATION_EMAIL` | Development helper email setting. |

Docker Compose provides defaults for development, but real secrets should be placed only in the local `.env`.

## 21. How to Run the Project

Start:

```bash
docker compose up -d
```

Stop:

```bash
docker compose down
```

Fresh reset:

```bash
docker compose down -v
docker compose up -d
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed:superadmin
```

Run migrations:

```bash
docker compose exec backend npm run db:migrate
```

Seed Super Admin:

```bash
docker compose exec backend npm run db:seed:superadmin
```

Frontend URL:

```text
http://localhost:5173
```

Backend API:

```text
http://localhost:5000/api
```

DBeaver connection:

| Field | Value |
| --- | --- |
| Host | `localhost` |
| Port | `5432` or value from `.env` / Docker Compose |
| Database | `parcel_nexus` or value from `.env` |
| Username | from `.env` / Docker Compose |
| Password | from `.env` / Docker Compose |

## 22. Testing Guide

Suggested role-based test order:

1. Seed/login as Super Admin.
2. Create Admin account.
3. Activate Admin.
4. Login as Admin.
5. Create Guard and Resident accounts.
6. Activate Guard and Resident.
7. Login as Guard and register parcels.
8. Login as Resident and confirm own unit parcels only.
9. Login as Admin and verify dashboard, parcel management, and reports.

Super Admin tests:

- Login redirects to `/accounts`.
- Can create/edit Admin accounts.
- Cannot access `/dashboard`.
- Profile hides Notification Preferences.

Admin tests:

- Dashboard loads real counts.
- Accounts page manages Guard/Resident only.
- Parcel Management lists parcels.
- Admin can soft-delete parcels.
- Admin can export Parcel Management CSV.
- Generate Report creates Dashboard Summary PDF/CSV.

Guard tests:

- Guard Dashboard loads.
- Parcel Registration works.
- Courier add/edit works.
- Tracking duplicate per courier is enforced.
- Guard can edit parcel records.
- Guard cannot delete/export parcel records.

Resident tests:

- Resident Dashboard shows own parcel summary.
- Pending/history tabs work.
- Search works.
- Resident cannot see other unit parcels.
- Select parcel bottom bar works.
- Generate QR button shows placeholder only.

End-to-end parcel workflow:

1. Admin creates Resident linked to unit.
2. Guard logs parcel for that unit.
3. Resident sees pending parcel.
4. Admin/Guard sees parcel in Parcel Management.
5. Admin Dashboard updates counts/trend.

Access control direct URL testing:

- Guard visiting `/accounts` should fail through API access.
- Resident visiting `/parcels` should not have parcel management access.
- Super Admin visiting `/dashboard` redirects to `/accounts`.

Responsive testing sizes:

- `360 x 800`
- `390 x 844`
- `768 x 1024`
- `1440 x 900`

Report testing:

- Admin Dashboard -> Generate Report.
- Confirm only Dashboard Summary Report option appears.
- Generate PDF.
- Generate CSV if format is selected.
- Confirm Parcel Management Export CSV remains available separately.

Password reset testing:

- Forgot Password shows `Sending...`.
- Successful send starts 60-second cooldown.
- Same-password reset returns: `New password cannot be the same as your current password.`
- Successful reset redirects to `/login`.

Duplicate tracking number testing:

- Register `DHL + TEST123`: success if new.
- Register `DHL + TEST123` again: rejected.
- Register `SPX + TEST123`: allowed.
- Register `DHL + test123` after `DHL + TEST123`: rejected.

Timezone dashboard testing:

- Register/insert parcel at Malaysia early morning such as `2026-06-06 03:00 +08`.
- Admin Dashboard selected date `2026-06-06` should count it under 6 June.
- Guard Dashboard selected date `2026-06-06` should count it correctly.
- Parcel table display should remain correct.

## 23. Common Troubleshooting

| Issue | Likely cause | Solution |
| --- | --- | --- |
| Website not reachable | Containers not running or port conflict. | Run `docker compose ps`, then `docker compose up -d`. |
| Backend 500 error | Database unavailable or migration missing. | Check backend logs and run migrations. |
| DBeaver cannot see tables | Connected to wrong DB/port or migrations not run. | Verify `.env`, Docker Compose ports, and run `npm run db:migrate` inside backend container. |
| Super Admin missing after reset | Seed script not run. | Run `docker compose exec backend npm run db:seed:superadmin`. |
| Database deleted | `docker compose down -v` removed volume. | Recreate with `up -d`, migrate, seed. |
| Migration 006 duplicate tracking issue | Existing active duplicate `(courier_id, tracking_number)` records. | Inspect duplicates before applying the unique index. |
| Email sending slow | SMTP provider/network latency. | UI shows loading; verify SMTP settings if it fails. |
| SMTP not configured | Missing SMTP env variables. | Add SMTP values to local `.env`; do not commit them. |
| Frontend build error | Syntax/CSS/import issue. | Run `npm run build --workspace frontend` and inspect error line. |
| Docker backend missing dependency | Node modules volume stale. | Rebuild backend or run install inside container; avoid deleting data volume accidentally. |
| Session expires while using app | JWT expiry is 1 hour. | Frontend auto logs out and asks user to log in again. |

## 24. Future Improvements

Possible future work:

- Real barcode scanner integration using ZXing or html5-qrcode.
- Cloud file storage for parcel photos.
- Production email provider instead of development SMTP.
- Full QR parcel collection and Guard verification flow.
- Push/in-app notifications.
- Full Audit Log module and UI.
- Full Dispute Management module and UI.
- Advanced report filters and report templates.
- Deployment to cloud server.
- Dedicated migration tracking table for production-grade migrations.
- More automated backend and frontend tests.

## 25. Viva Quick Explanation

### Why PostgreSQL?

PostgreSQL is reliable, supports strong constraints, UUIDs, partial indexes, foreign keys, and good relational modelling. It is suitable for parcel records, users, units, and role relationships.

### Why not MySQL?

MySQL could also work, but PostgreSQL has excellent support for partial unique indexes, which is useful for active parcel tracking uniqueness where `deleted_at IS NULL`.

### Why Docker?

Docker makes the frontend, backend, and database run consistently across machines. It avoids manual setup differences and makes it easier to reset the FYP environment.

### Why DBeaver?

DBeaver provides a visual way to inspect PostgreSQL tables, rows, constraints, and relationships. It is useful for debugging and viva demonstration.

### What is JWT?

JWT means JSON Web Token. Parcel Nexus uses it as a signed login token so the backend can verify the user's identity and role on protected API requests.

### What is a Bearer token?

A Bearer token is sent in the HTTP Authorization header:

```text
Authorization: Bearer <token>
```

The backend reads and verifies it before allowing protected operations.

### Why use backend report generation?

Backend report generation ensures reports use trusted server-side data and role checks. It also avoids exposing sensitive query logic to the browser.

### Why store files outside the database?

Images are better stored as files or object storage. The database stores the file path/URL, which keeps database rows smaller and easier to query.

### Why use role-based access control?

Parcel Nexus has different responsibilities for Super Admin, Admin, Guard, and Resident. RBAC prevents users from accessing data or actions outside their role.

### Why remove Guard assigned post?

GEM guards rotate and are not permanently tied to one block. Removing assigned post keeps the FYP workflow simple and avoids future complexity in parcels, disputes, dashboards, and collection.

### Why Resident password change uses email verification?

Resident accounts may be shared by family members in the same unit. Email verification protects the registered account owner from someone changing the password directly from an already logged-in session.

