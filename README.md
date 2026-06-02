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

Actual email sending, frontend authentication pages, user management, parcel registration, parcel management, and parcel collection logic are not implemented yet.


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
- Forgot password and reset password with secure token hashing
- Login route
- Account activation route
- Forgot password route
- Reset password route
- Current user route
- Logout route
- Authentication middleware
- Role-based access middleware for future protected routes
- Manual development SUPER_ADMIN seed script
- Manual development activation token script

It does not yet provide:

- Account activation email
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

Forgot password:

```text
POST /api/auth/forgot-password
```

Accepts an email address. For security, it always returns a generic message so the system does not reveal whether the email exists.

Reset password:

```text
POST /api/auth/reset-password
```

Accepts a reset token and a new password. If the token is valid, unused, and not expired, the backend saves the new hashed password and marks the token as used.

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

## Gmail SMTP Email Setup

Parcel Nexus uses Gmail SMTP with a Google App Password for backend email sending.

Before testing real email sending:

1. Enable Google 2-Step Verification on the Gmail account.
2. Generate a Google App Password from your Google Account security settings.
3. Put SMTP values only in your local root `.env` file.
4. Do not commit `.env` to GitHub.

Example local `.env` values:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=systemdeveloper.gem@gmail.com
SMTP_PASS=your_google_app_password_here
SMTP_FROM=Parcel Nexus <systemdeveloper.gem@gmail.com>
FRONTEND_URL=http://localhost:5173
```

Do not put real Gmail credentials in `.env.example`, README, screenshots, or GitHub commits.

After changing `.env`, recreate the backend container:

```bash
docker compose up -d --build backend
```

If an email is not received, check:

- Gmail App Password is correct
- `SMTP_USER` matches the Gmail account
- spam/junk folder
- backend logs with `docker compose logs backend`

The frontend reset and activation pages are not implemented yet, so email links currently point to future frontend routes:

```text
http://localhost:5173/reset-password?token=...
http://localhost:5173/activate?token=...
```

## Account Activation Backend Flow

Account activation is used for accounts created with status `PENDING_ACTIVATION`.

The backend creates a secure raw activation token, hashes it with SHA-256, and stores only the hash in `account_activation_tokens`. The raw token is meant to be sent to the user by email later.

Actual email sending is not implemented yet. The User Management Module will later create users and trigger activation tokens. Until then, a development-only script can create an activation token manually for testing.
When SMTP is configured, the development activation script can also send the activation email.

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
If Gmail SMTP is configured, the script also sends an activation email to `DEV_ACTIVATION_EMAIL`.

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

## Forgot Password Backend Flow

The forgot password endpoint accepts an email address:

```text
POST http://localhost:5000/api/auth/forgot-password
```

For security, the response is always generic:

```json
{
  "message": "If the email is registered and active, password reset instructions will be sent."
}
```

If the email belongs to an `ACTIVE` user, the backend creates a secure raw reset token, hashes it with SHA-256, and stores only the hash in `password_reset_tokens`. The reset token expires after 15 minutes.

When Gmail SMTP is configured, the backend sends a reset password email. In `NODE_ENV=development`, the response also includes `developmentResetToken` so you can test with Postman. This raw token is not returned in production.

When creating a new reset token, the backend marks older unused reset tokens for the same user as used. This keeps only the latest reset token usable and avoids confusion during testing.

## Test Forgot Password With Postman

Create a request:

```text
POST http://localhost:5000/api/auth/forgot-password
```

Go to `Body`, choose `raw`, and select `JSON`.

Use an active user's email:

```json
{
  "email": "your-email@example.com"
}
```

In development, copy the `developmentResetToken` from the response.
If SMTP is configured, you should also receive a reset password email. The link points to the future frontend reset password page.

Before testing, make sure your local root `.env` has the correct values and Docker has reloaded them:

```bash
docker compose up -d --build backend
```

Do not commit `.env` to GitHub.

## Test Reset Password With Postman

Create a request:

```text
POST http://localhost:5000/api/auth/reset-password
```

Go to `Body`, choose `raw`, and select `JSON`.

Use the reset token from the forgot password response:

```json
{
  "token": "RAW_RESET_TOKEN_FROM_FORGOT_PASSWORD",
  "newPassword": "AnotherStrongPassword123!"
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
  "message": "Password reset successfully. You can now log in with the new password."
}
```

After reset, test login using the same email and the new password.

## Profile Backend API

The profile API is for the currently logged-in user.

All profile endpoints require a JWT Bearer token from login:

```text
Authorization: Bearer YOUR_ACCESS_TOKEN
```

View own profile:

```text
GET /api/profile
```

Update own profile:

```text
PUT /api/profile
```

Change own password:

```text
POST /api/profile/change-password
```

## Profile Fields

Users may update only:

- `email`
- `phone_number`
- `first_name`
- `last_name`

Users may not update:

- `role`
- `status`
- `unit_id`
- `assigned_post`
- `created_by`
- `password_hash`
- password through `PUT /api/profile`

Password changes must use:

```text
POST /api/profile/change-password
```

Role-specific rules:

- `ADMIN`, `GUARD`, and `SUPER_ADMIN` must have `first_name` and `last_name`.
- `RESIDENT` may have blank or null `first_name` and `last_name` because the resident account is identified by unit number.
- Resident `unit_id` is read-only and set by management.
- Guard `assigned_post` is read-only and set by management.

Notification preferences are not implemented yet because they belong to a later Notification/Settings module.

## Test Profile With Postman

First log in:

```text
POST http://localhost:5000/api/auth/login
```

Copy the `accessToken` from the response.

For each profile request, go to the `Authorization` tab in Postman:

```text
Type: Bearer Token
Token: YOUR_ACCESS_TOKEN
```

View profile:

```text
GET http://localhost:5000/api/profile
```

Update profile:

```text
PUT http://localhost:5000/api/profile
```

Body -> raw -> JSON:

```json
{
  "email": "new-email@example.com",
  "phone_number": "0123456789",
  "first_name": "System",
  "last_name": "Developer"
}
```

Try these validation checks:

- Use an email already used by another account to see the uniqueness error.
- Send a blank `phone_number` to see the required-field error.
- Try sending `role`, `status`, `unit_id`, or `assigned_post`; they will not be updated.

Change password:

```text
POST http://localhost:5000/api/profile/change-password
```

Body -> raw -> JSON:

```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewStrongPassword123!"
}
```

After changing password, log in again with the new password.

Before testing, make sure your local root `.env` exists and Docker has reloaded it:

```bash
docker compose up -d --build backend
```

Do not commit `.env` to GitHub.

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
