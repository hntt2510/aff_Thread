# aff_Thread (Threads Affiliate Manager)

Personal web-based Threads Affiliate Manager built with Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL, Drizzle ORM, and the official Meta Threads Graph API.

---

## Features

- **Single Admin Authentication**: Protected with secure scrypt password hashing and signed 24-hour HttpOnly session cookies via `jose`.
- **Multi-Account Manager**: Connect multiple Threads tester accounts using long-lived access tokens.
- **Identity Verification**: Verifies profile identity directly with Meta's official Graph API (`GET /me`) before storing.
- **AES-256-GCM Token Encryption**: All access tokens are encrypted at rest with authenticated encryption (ciphertext + IV + auth tag). Plain tokens are never sent to the browser or logged.
- **Account Protection**: Strict duplicate prevention and identity checking (tokens cannot accidentally overwrite different account identities).
- **Manual Text Publishing**: Full two-stage container publication (`POST /me/threads` -> `POST /me/threads_publish`) with strict multi-account isolation.
- **Audit History**: Complete post logs with container IDs, Threads post IDs, and sanitized error reporting.
- **Deployment Ready**: Fully serverless-compatible for Vercel deployment with any PostgreSQL database (Neon, Supabase, etc.).

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Signed 24-hour session JWTs (`jose`) with HttpOnly cookies
- **Security**: AES-256-GCM token encryption, scrypt password hashing with `crypto.timingSafeEqual`, centralized error sanitizer
- **Testing**: Vitest with unit & integration suites

---

## Local Setup

### 1. Prerequisites

- Node.js 20+ (tested on Node v22)
- PostgreSQL database (Local Docker, Neon, or Supabase)

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file from the provided `.env.example`:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `ADMIN_USERNAME` | Admin login username (default: `admin`) |
| `ADMIN_PASSWORD_HASH` | Secure `salt:hash` string generated with scrypt |
| `SESSION_SECRET` | Secret key for signing 24-hour sessions (min 32 characters) |
| `THREADS_TOKEN_ENCRYPTION_KEY` | 32-byte (64 hex characters) key for AES-256-GCM |
| `DATABASE_URL` | PostgreSQL connection string |

### 4. Generating Secrets & Password Hash

Generate encryption keys and session secrets:

```bash
node scripts/generate-key.mjs
```

Generate a secure password hash:

```bash
node scripts/hash-password.mjs <your_password>
```

Copy the generated hash into `ADMIN_PASSWORD_HASH` in `.env.local`.

### 5. Run Database Migrations

Apply database schema to your PostgreSQL database:

```bash
npm run db:push
```

Or generate migration files:

```bash
npm run db:generate
```

---

## Development & Testing Commands

- **Start Development Server**:
  ```bash
  npm run dev
  ```
  Open `http://localhost:3000`.

- **Run Automated Tests**:
  ```bash
  npm run test
  ```

- **Typecheck**:
  ```bash
  npm run typecheck
  ```

- **Lint**:
  ```bash
  npm run lint
  ```

- **Production Build**:
  ```bash
  npm run build
  ```

---

## How to Add Threads Tester Accounts (Meta Development Mode)

During Meta development mode, you can connect tester accounts without full App Review:

1. Go to the [Meta for Developers Portal](https://developers.facebook.com/).
2. Select your App with Threads API enabled.
3. In **App Roles** -> **Roles**, click **Add Threads Tester**.
4. Enter the Instagram/Threads username of the tester.
5. Have the tester log into Instagram/Threads settings -> **Website permissions** -> **Invites** and accept the tester invitation.
6. Generate a User Access Token with `threads_basic` and `threads_content_publish` permissions.
7. Exchange it for a **long-lived access token** (valid for 60 days).
8. Open `aff_Thread` application -> **Accounts** -> **Add Account**.
9. Paste the token and click **Verify Account**. Once the profile preview appears, click **Add Account**.

---

## Vercel Deployment

1. Push code to your GitHub repository (`hntt2510/aff_Thread`).
2. In the Vercel dashboard, import the project.
3. Add the following Environment Variables in Vercel Project Settings:
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH`
   - `SESSION_SECRET`
   - `THREADS_TOKEN_ENCRYPTION_KEY`
   - `DATABASE_URL` (pointing to a production serverless PostgreSQL like Neon or Supabase)
4. Deploy the project.
5. In production, run migrations against your production database using `npx drizzle-kit push`.
