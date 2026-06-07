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

## Notes And Warnings

- Do not commit `.env`.
- Do not commit real uploaded files.
- Do not commit `node_modules`.
- Do not use `docker compose down -v` unless you intentionally want to delete local PostgreSQL data.

