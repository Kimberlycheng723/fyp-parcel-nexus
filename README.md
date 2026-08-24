# Parcel Nexus

Web-based Parcel Management System for GEM Condominium.

## Project Overview

Parcel Nexus digitalises the parcel handling process at GEM Condominium. The system is being built to replace the manual logbook process with a clearer workflow for account access, parcel registration, parcel management and parcel collection.

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
- General Module
- Account Management Module
- Parcel Registration Module
- Parcel Management Module
- Dashboard and Record Module
- Parcel Collection Module
- Notification Backend and Resident Notification Center
- Native Web Push notifications

## Environment Setup

Create your local environment file from the example:

```bash
cp .env.example .env
```

Then update `.env` with your own local development values, such as database credentials, JWT secrets, seed user values, and Gmail SMTP values.

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

### Local HTTPS for iPad/mobile camera testing

Browser camera access requires a secure HTTPS origin when Parcel Nexus is opened
from another device on the local network. HTTP remains the default development
mode. To enable trusted local HTTPS on macOS:

1. Install mkcert: `brew install mkcert`
2. Generate the local certificate: `./frontend/scripts/setup-local-https.sh`
3. Start the HTTPS override:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --force-recreate frontend
   ```

4. Open the LAN HTTPS URL printed by the setup script.

The certificate includes localhost, the Mac `.local` hostname, and the current
Wi-Fi IP without storing an IP address in source control. The frontend continues
to proxy `/api` and `/uploads` to the backend container.

For iPad trust, transfer only `frontend/.cert/rootCA.pem` to the iPad. Install the
downloaded profile in **Settings > General > VPN & Device Management**, then enable
full trust in **Settings > General > About > Certificate Trust Settings**. Never
transfer the mkcert `rootCA-key.pem` private key.

Return to normal HTTP mode with:

```bash
docker compose -f docker-compose.yml up -d --force-recreate frontend
```
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

## Development Seed

Create one development `SUPER_ADMIN` account:

```bash
docker compose exec backend npm run db:seed:superadmin
```

The seed script uses values from your local `.env`. Real credentials are not hardcoded in the source code.


## Email Sending

Parcel Nexus uses Gmail SMTP with a Google App Password for system emails such as password reset and account activation.

SMTP credentials must be stored only in the local `.env` file. They should not be committed, written into README examples, or uploaded to GitHub.

## Native Web Push

Parcel Nexus uses standards-based Web Push with a service worker and VAPID. It
does not use Firebase. Generate one stable VAPID key pair for each environment:

```bash
docker compose exec backend npm run webpush:generate-vapid
```

Store `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` in the local
environment only, then recreate the backend container. Never commit the private
key and never generate a new key pair on every server start, because existing
browser subscriptions are bound to the original public key.


## Notes And Warnings

- Do not commit `.env`.
- Do not commit real uploaded files.
- Do not commit `node_modules`.
- Do not use `docker compose down -v` unless you intentionally want to delete local PostgreSQL data.
