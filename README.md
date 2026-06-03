# Parcel Nexus

Web-based Parcel Management System for GEM Condominium.

## Project Overview

Parcel Nexus digitalises the parcel handling process at GEM Condominium. The system is being built to replace the manual logbook process with a clearer workflow for account access, parcel registration, parcel management, and parcel collection.

For FYP1, the project is being developed step by step so each module is understandable and easy to explain during viva.

## Tech Stack

- React + Vite frontend
- Express.js backend
- PostgreSQL database
- Docker Compose development environment
- JWT authentication
- Gmail SMTP for system emails
- DBeaver as an optional database management and visualisation tool

## Current Implemented Scope

The project currently includes:

- Docker Compose foundation for frontend, backend, and PostgreSQL
- PostgreSQL schema and migration setup
- General Module backend
- General Module frontend
- Login and logout
- Account activation backend
- Forgot password and reset password with Gmail SMTP
- Profile view, profile update, and change password
- User Management backend foundation
- User Management frontend for Super Admin and Admin account workflows
- Parcel Registration backend foundation

Parcel Management and Parcel Collection are planned but not implemented yet.

## Environment Setup

Create your local environment file from the example:

```bash
cp .env.example .env
```

Then update `.env` with your own local development values, such as database credentials, JWT secrets, seed user values, and Gmail SMTP values.

Important:

- Do not commit `.env` to GitHub.
- Do not put real passwords or Gmail App Passwords inside `.env.example`.
- Do not share `docker compose config` output publicly because it may reveal secrets from `.env`.

## Running The Project

Build and start all services:

```bash
docker compose up --build
```

Start services after they have already been built:

```bash
docker compose up
```

Stop services:

```bash
docker compose down
```

Local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- PostgreSQL: `localhost:5432`

## Database Setup

Run the database migrations:

```bash
docker compose exec backend npm run db:migrate
```

Check that the tables exist:

```bash
docker compose exec postgres psql -U parcel_nexus_user -d parcel_nexus -c "\dt"
```

Current FYP1 database tables include:

- `units`
- `users`
- `courier_companies`
- `parcels`
- `parcel_collections`
- `parcel_collection_items`
- `account_activation_tokens`
- `password_reset_tokens`

## Development Seed

Create one development `SUPER_ADMIN` account:

```bash
docker compose exec backend npm run db:seed:superadmin
```

The seed script uses values from your local `.env`. Real credentials are not hardcoded in the source code.

## Main Frontend Routes

- `/login`
- `/forgot-password`
- `/reset-password`
- `/activate`
- `/profile`
- `/accounts`
- `/parcels/new`

## Main Backend API Groups

- `/api/health`
- `/api/auth`
- `/api/profile`
- `/api/users`
- `/api/couriers`
- `/api/units`
- `/api/parcel-registration`

Detailed API testing steps are maintained separately during development.

## User Management Backend

The `/api/users` API group is protected by JWT authentication.

Role rules:

- `SUPER_ADMIN` manages `ADMIN` accounts only.
- `ADMIN` manages `GUARD` and `RESIDENT` accounts only.
- `GUARD` and `RESIDENT` cannot access user management APIs.

When a new account is created, the backend creates an activation token and sends an activation email if Gmail SMTP is configured. Check your local `.env` SMTP values before testing, and never commit `.env`.

The `/accounts` frontend page is available for `SUPER_ADMIN` and `ADMIN` users. Super Admin manages Admin accounts only. Admin manages Guard and Resident accounts only.

## Parcel Registration Backend

The Parcel Registration backend is available for `GUARD` users only.

Current backend support includes:

- `GET /api/couriers` for active courier company options
- `POST /api/couriers` for guards to add a courier company during registration
- `GET /api/units/search` for looking up existing condominium units
- `POST /api/parcel-registration/photos` for local parcel photo upload
- `POST /api/parcel-registration/sessions` for registering one or more parcels in one courier workflow

Units must already exist before parcel registration. If a unit is missing, Admin should create the resident/unit account first through User Management.

Parcel photos are stored locally in `backend/uploads/parcels/` during development. The frontend camera capture flow will be implemented later; the backend already supports receiving the captured or selected image file. Notification sending for registered parcels is also a future module.

The `/parcels/new` frontend route is available for `GUARD` users only. It supports the two-step courier session flow, unit lookup, optional parcel photo capture/upload, and physical barcode scanner input through normal keyboard-style scanning. Units must already exist before a guard can register parcels. Camera access depends on browser permission and normally requires HTTPS in real deployment.

## Email Sending

Parcel Nexus uses Gmail SMTP with a Google App Password for system emails such as password reset and account activation.

SMTP credentials must be stored only in the local `.env` file. They should not be committed, written into README examples, or uploaded to GitHub.

## Notes And Warnings

- Do not commit `.env`.
- Do not commit real uploaded files.
- Do not commit `node_modules`.
- Do not use `docker compose down -v` unless you intentionally want to delete local PostgreSQL data.
- Notification preferences in the current frontend are local placeholders only. No notification backend or database table has been implemented yet.
- Parcel Management and Parcel Collection are not implemented yet.

## Future Modules

The next planned modules are:

- User Management
- Parcel Registration
- Parcel Management
- Parcel Collection
- Notifications, Disputes, Audit Log, and Reporting in later phases
