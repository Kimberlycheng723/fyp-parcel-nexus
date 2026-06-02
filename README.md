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
- Basic backend authentication foundation
- Backend account activation foundation

Forgot/reset password, actual email sending, frontend authentication pages, user management, parcel registration, parcel management, and parcel collection logic are not implemented yet.


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

3. Seed one development SUPER_ADMIN user:

```bash
docker compose exec backend npm run db:seed:superadmin
```

The seed runs only when you manually run this command. It creates the user only if the seed email does not already exist.

4. Open the frontend:

```text
http://localhost:5173
```

5. Check the backend health route:

```text
http://localhost:5000/api/health
```

6. Check the backend database connection:

```text
http://localhost:5000/api/health/db
```

The response should show that the database is connected. It does not expose sensitive database details.

7. Stop all services:

```bash
docker compose down
```

8. Stop all services and delete the database volume:

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

## Backend Authentication Foundation

The current backend authentication foundation provides:

- Password hashing with `bcryptjs`
- JWT access token creation and verification
- Account activation with secure token hashing
- Login route
- Account activation route
- Current user route
- Logout route
- Authentication middleware
- Role-based access middleware for future protected routes
- Manual development SUPER_ADMIN seed script
- Manual development activation token script

It does not yet provide:

- Account activation email
- Forgot password
- Reset password email
- Real email sending
- Frontend login page
- User management screens

## Authentication Endpoints

Login:

```text
POST /api/auth/login
```

Returns a JWT access token and safe user information when email and password are valid.

Activate account:

```text
POST /api/auth/activate
```

Accepts an activation token and a new password. If the token is valid, unused, and not expired, the backend saves the hashed password and changes the user status to `ACTIVE`.

Current logged-in user:

```text
GET /api/auth/me
```

Requires a Bearer token. Returns safe user profile information.

Logout:

```text
POST /api/auth/logout
```

Requires a Bearer token. Because this project uses JWT access tokens, logout is handled by removing the token on the client side. No token blacklist is implemented yet.

## Development SUPER_ADMIN Seed

The seed values come from `.env`:

```text
SEED_SUPER_ADMIN_EMAIL=superadmin@parcelnexus.local
SEED_SUPER_ADMIN_PASSWORD=ChangeMe_StrongPassword123!
SEED_SUPER_ADMIN_FIRST_NAME=System
SEED_SUPER_ADMIN_LAST_NAME=Owner
SEED_SUPER_ADMIN_PHONE=0123456789
```

For your own development, edit `.env` and replace the seed password with a strong local password. Do not commit `.env` to GitHub.

Run the seed:

```bash
docker compose exec backend npm run db:seed:superadmin
```

## Test Login With Curl

Replace the email and password with the values from your `.env` file:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@example.com","password":"replace_with_a_strong_development_password"}'
```

The response includes an `accessToken`. Copy that token for the next test.

## Test Current User

Use the token from login:

```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

This should return safe user information only. It does not return `password_hash`.

## Test Logout

Use the token from login:

```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

The response tells the client to remove the token. This is normal for a basic JWT logout flow.

## Account Activation Backend Flow

Account activation is used for accounts created with status `PENDING_ACTIVATION`.

The backend creates a secure raw activation token, hashes it with SHA-256, and stores only the hash in `account_activation_tokens`. The raw token is meant to be sent to the user by email later.

Actual email sending is not implemented yet. The User Management Module will later create users and trigger activation tokens. Until then, a development-only script can create an activation token manually for testing.

## Development Activation Token

Before testing, check your local root `.env` file and add or update:

```text
DEV_ACTIVATION_EMAIL=admin@parcelnexus.local
```

Set this email to an existing user in your `users` table. The script only works when `NODE_ENV=development`.

After changing `.env`, recreate the backend container so Docker picks up the new value:

```bash
docker compose up -d --build backend
```

Create a development activation token:

```bash
docker compose exec backend npm run db:create-activation-token
```

The script prints the raw activation token in the terminal for testing. The database stores only the SHA-256 token hash.

Do not commit `.env` to GitHub.

## Test Account Activation With Postman

Create a request:

```text
POST http://localhost:5000/api/auth/activate
```

Go to `Body`, choose `raw`, and select `JSON`.

Use the raw token printed by the development script:

```json
{
  "token": "RAW_ACTIVATION_TOKEN_FROM_TERMINAL",
  "newPassword": "NewStrongPassword123!"
}
```

The new password must include:

- At least 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

If successful, the response is:

```json
{
  "message": "Account activated successfully. You can now log in."
}
```

After activation, test login using the activated user's email and new password.

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
