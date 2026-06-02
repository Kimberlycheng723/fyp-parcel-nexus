# Parcel Nexus

Parcel Nexus is a FYP web application for GEM Condominium parcel management.

The project will be built step by step using:

- React with Vite for the frontend
- Node.js with Express.js for the backend
- PostgreSQL for the database
- JWT for authentication
- Docker Compose for the local development environment

## Current Status

This repository currently contains only the basic project foundation:

- Frontend Vite React app shell
- Backend Express app shell
- PostgreSQL database service
- Full development Docker Compose setup
- Environment variable examples


## Docker Development Setup

This project runs with three Docker Compose services:

- `frontend`: runs the React + Vite development server
- `backend`: runs the Express.js API server
- `postgres`: runs the PostgreSQL database

The database uses a named Docker volume called `postgres_data`, so database files are kept when the PostgreSQL container restarts.

## How The Services Communicate

- Your browser opens the frontend at `http://localhost:5173`.
- The frontend calls the backend using `http://localhost:5000/api`.
- The backend connects to PostgreSQL using the Docker service name `postgres`, not `localhost`.

Inside Docker, `localhost` means "this same container", so the backend database URL must use:

```text
postgres://parcel_nexus_user:parcel_nexus_password@postgres:5432/parcel_nexus
```

## Environment Files

Copy the safe example file before running the project:

```bash
cp .env.example .env
```

Do not push `.env` files to GitHub. They may contain real passwords or secrets later.

## How To Run With Docker Compose

1. Build and start all services:

```bash
docker compose up --build
```

2. Apply the database schema in another terminal:

```bash
docker compose exec backend npm run db:migrate
```

This command creates the FYP1 tables if they do not already exist. It does not drop existing tables.

3. Open the frontend:

```text
http://localhost:5173
```

4. Check the backend health route:

```text
http://localhost:5000/api/health
```

5. Check the backend database connection:

```text
http://localhost:5000/api/health/db
```

The response should show that the database is connected. It does not expose sensitive database details.

6. Stop all services:

```bash
docker compose down
```

7. Stop all services and delete the database volume:

```bash
docker compose down -v
```

Only use `docker compose down -v` when you intentionally want to remove the local PostgreSQL data.

## FYP1 Database Tables

The current schema creates only the tables needed for the selected FYP1 modules:

- `units`: condominium unit records
- `users`: system user accounts for super admin, admin, guard, and resident
- `courier_companies`: courier companies used during parcel registration
- `parcels`: parcel records
- `parcel_collections`: one QR code / one collection session
- `parcel_collection_items`: parcels included inside a QR collection session
- `account_activation_tokens`: account activation tokens
- `password_reset_tokens`: forgot/reset password tokens


## Verify That Tables Exist

After running the migration, you can list tables using:

```bash
docker compose exec postgres psql -U parcel_nexus_user -d parcel_nexus -c "\dt"
```

You should see:

```text
account_activation_tokens
courier_companies
parcel_collection_items
parcel_collections
parcels
password_reset_tokens
units
users
```

You can also check that PostgreSQL is running with:

```bash
docker compose ps
```

## Useful Docker Commands

Check running containers:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs
```

View backend logs only:

```bash
docker compose logs backend
```

View frontend logs only:

```bash
docker compose logs frontend
```

View PostgreSQL logs only:

```bash
docker compose logs postgres
```

## Local URLs

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- Backend health check: `http://localhost:5000/api/health`
- Backend database health check: `http://localhost:5000/api/health/db`
- PostgreSQL: `localhost:5432`

## GitHub Safety

These files and folders should not be pushed to GitHub:

- `.env`
- `backend/.env`
- `frontend/.env`
- `node_modules/`
- `backend/node_modules/`
- `frontend/node_modules/`
- `frontend/dist/`
- uploaded parcel photos in `backend/uploads/parcels/`

The `.env.example` files are safe to push because they contain placeholders only.

## Old Non-Docker Local Run Option

If you want to run without Docker later, install dependencies:

```bash
npm install
```

Then copy the environment examples:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```
