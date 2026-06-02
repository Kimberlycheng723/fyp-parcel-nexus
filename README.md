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

The selected modules have not been implemented yet.

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

2. Open the frontend:

```text
http://localhost:5173
```

3. Check the backend health route:

```text
http://localhost:5000/api/health
```

4. Stop all services:

```bash
docker compose down
```

5. Stop all services and delete the database volume:

```bash
docker compose down -v
```

Only use `docker compose down -v` when you intentionally want to remove the local PostgreSQL data.

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
