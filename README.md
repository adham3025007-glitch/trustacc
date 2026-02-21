# File Portal App (Admin + User)

A full-stack Node.js + Express + SQLite application with role-based authentication and secure file assignment.

## Features
- Separate login pages for `Admin` and `User`
- Password hashing with `bcryptjs`
- Admin dashboard:
  - create users (admin or user)
  - upload files
  - assign files to specific users
  - view all users and all assigned files
- User dashboard:
  - view only assigned files
  - download only assigned files
- Route-level access control
- Upload file type and size validation
- Login attempt throttling/temporary lockout
- No-store caching headers on protected pages
- SQLite relational schema for users and files metadata

## Tech Stack
- Backend: Node.js, Express
- Frontend: EJS templates + CSS
- DB: SQLite
- Auth: Session-based auth (`express-session`)

## Setup
1. Open terminal in `file-portal-app`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create environment file:
   ```bash
   copy .env.example .env
   ```
4. Update `.env` and set a strong `SESSION_SECRET`
5. Start server:
   ```bash
   npm start
   ```
6. Open:
   - `http://localhost:3000/login/admin`
   - `http://localhost:3000/login/user`

## Deploy on Railway
1. Push this project to GitHub (with the root `Dockerfile` included).
2. In Railway, click `New Project` -> `Deploy from GitHub repo`.
3. Select this repository.
4. Railway will build using the root `Dockerfile` automatically.
5. In Railway project variables, set:
   - `SESSION_SECRET` = a long random secret
   - `DB_PATH` = `data/app.db` (optional, already defaulted)
   - `STORAGE_DIR` = `storage` (optional, already defaulted)
6. Deploy, then open:
   - `https://<your-domain>/login/admin`
   - `https://<your-domain>/login/user`

### Railway Persistence Note
- If you keep SQLite and local uploads on the container filesystem, data can be lost on redeploy/restart.
- For persistence, use a Railway Volume (or move to managed DB + object storage).

## Deploy on Render (Free)
1. Push this project to GitHub.
2. In Render, click `New +` -> `Blueprint`.
3. Select your repo and use `file-portal-app/render.yaml`.
4. Deploy.
5. Open:
   - `https://<your-service>.onrender.com/login/admin`
   - `https://<your-service>.onrender.com/login/user`

### Important Free-Tier Note
- On Render Free web services, local filesystem data is ephemeral.
- SQLite (`data/app.db`) and uploaded files (`storage/`) can be lost on restart/redeploy.
- For persistence, move to managed Postgres + object storage (S3/Cloudinary), or use a paid persistent-disk option.

## Default Seeded Accounts
- Admin:
  - username: `admin`
  - password: `admin123`
- User:
  - username: `user1`
  - password: `user123`

## Security Notes
- Uploaded files are stored in `storage/` and are not publicly served.
- Download routes verify ownership/role before serving files.
- Uploads are restricted by MIME type and a 10MB size limit.
- Failed/invalid uploads are cleaned up to avoid orphaned files.
- Change seeded passwords immediately in production.
- For production, set `cookie.secure = true` (HTTPS), use a persistent session store, and add CSRF protection.

## Database Schema
See `sql/schema.sql`.
