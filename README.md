# aff_Thread (Threads Affiliate Manager)

Personal web-based Threads Affiliate Manager built with Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL, Drizzle ORM, and the official Meta Threads Graph API.

---

## Features

- **Single Admin Authentication**: Protected with secure scrypt password hashing and signed 24-hour HttpOnly session cookies via `jose`.
- **Multi-Account Manager**: Connect multiple Threads tester accounts using long-lived access tokens.
- **Identity Verification**: Verifies profile identity directly with Meta's official Graph API (`GET /me`) before storing.
- **AES-256-GCM Token Encryption**: All access tokens are encrypted at rest with authenticated encryption (ciphertext + IV + auth tag). Plain tokens are never sent to the browser or logged.
- **Account Protection**: Strict duplicate prevention and identity checking (tokens cannot accidentally overwrite different account identities).
- **Multi-Format Publishing**: Support for `TEXT`, `IMAGE`, `VIDEO`, and `CAROUSEL` (2-10 items) via official Meta Threads Graph API. Includes serverless-safe asynchronous video container readiness polling and automatic rescheduling.
- **Affiliate Tracking Engine**: Public `/r/[slug]` redirect endpoints with 307 temporary redirects, privacy-minimal salted SHA-256 IP hashing (zero raw IP storage), bot classification, post attribution, and campaign analytics.
- **Queue Scheduler Observability**: Primary automated 1-minute runner (`cron-job.org`) with `scheduler_runs` audit table and live heartbeat health monitoring (`HEALTHY`, `DEGRADED`, `STALE`) in the Dashboard.
- **Audit History**: Complete post logs with container IDs, Threads post IDs, media attachments, affiliate links, and sanitized error reporting.
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
npm run db:migrate
```

Committed migrations in `src/db/migrations` are the single source of truth for the schema. Run `npm run db:migrate` to apply migrations without runtime DDL mutations.

---

## Scheduling & Queue Engine

### Post Lifecycle State Machine

Each post moves through an explicit, validated lifecycle:
- **DRAFT**: Created locally but not yet scheduled or published.
- **SCHEDULED**: Queued for future automated delivery with a canonical UTC timestamp.
- **PUBLISHING**: Claimed atomically by a worker (`SELECT ... FOR UPDATE SKIP LOCKED`).
- **PUBLISHED**: Confirmed publication by Meta Threads API with permanent post ID. (Terminal state: immutable).
- **FAILED**: Published or claimed attempt failed after exhausting retries or encountering fatal non-retryable error.
- **CANCELLED**: Scheduled post intentionally cancelled by admin.

### Timezone & Timestamp Handling

- Scheduling input defaults to `Asia/Ho_Chi_Minh` (`UTC+7`, no daylight saving time).
- UI displays times in local time for clarity.
- All timestamps are stored canonically in UTC (`timestamptz`) in PostgreSQL.

### Atomic Claiming & Duplicate Prevention

Multiple serverless instances or workers may trigger the scheduler concurrently. To prevent duplicate publishing to Threads, the engine uses PostgreSQL atomic claiming:

```sql
UPDATE posts
SET status = 'PUBLISHING', publish_attempts = publish_attempts + 1, last_attempt_at = NOW()
WHERE id IN (
  SELECT id FROM posts
  WHERE status = 'SCHEDULED' AND scheduled_at <= NOW()
  ORDER BY scheduled_at ASC
  LIMIT 10
  FOR UPDATE SKIP LOCKED
) RETURNING *;
```

This guarantees that two racing workers will never claim or publish the same post.

### Bounded Retry Policy

- Maximum publish attempts: `MAX_PUBLISH_ATTEMPTS = 3`.
- **Retryable Errors**: Temporary network timeouts, Meta rate limits (`429`), or 5xx server errors. Backoff is calculated as `attempts * 2` minutes.
- **Non-Retryable Errors**: `INVALID_TOKEN` (401), `PERMISSION_ERROR` (403), or malformed content immediately transition to `FAILED` without burning retry attempts.
- If an account token is invalid, the account is marked `INVALID_TOKEN` so future posts avoid endless attempts until re-authenticated.

### Scheduler Endpoint (`/api/internal/scheduler/run`)

The scheduler runs statelessly via an HTTP endpoint:
- **Path**: `POST /api/internal/scheduler/run`
- **Authentication**: Requires ONLY `Authorization: Bearer <CRON_SECRET>`. Secrets are **never** accepted via URL query parameters (`?cron_secret=...`) or custom headers to prevent token leakage in server logs, analytics, or proxies. Comparison uses constant-time `crypto.timingSafeEqual`.
- **Concurrency & Atomicity**: Atomic claiming using PostgreSQL `FOR UPDATE SKIP LOCKED`. Multiple concurrent workers will never claim or publish the same scheduled post.
- **Stale Claim Recovery**: Posts stuck in `PUBLISHING` status for longer than 10 minutes (due to crashed containers or serverless timeouts) are safely recovered to `FAILED` with error code `STALE_PUBLISHING_TIMEOUT`. They are never blindly republished to guarantee no duplicate posts on Threads API.
- **Response**: Sanitized JSON execution summary with safe counters:
  ```json
  {
    "ok": true,
    "claimed": 2,
    "published": 2,
    "rescheduled": 0,
    "failed": 0,
    "staleRecovered": 0,
    "durationMs": 420
  }
  ```

#### How to Trigger via CLI
```bash
curl -X POST https://affthread-chi.vercel.app/api/internal/scheduler/run \
  -H "Authorization: Bearer <YOUR_CRON_SECRET>"
```

#### Production Scheduler Architecture
- **Primary Automated Scheduler (cron-job.org)**:
  - Invokes `POST /api/internal/scheduler/run` every 1 minute.
  - Header: `Authorization: Bearer <CRON_SECRET>`.
  - Header: `X-Scheduler-Source: cron-job-org`.
  - Concurrency safety: Handled atomically via PostgreSQL `FOR UPDATE SKIP LOCKED`.
- **Manual / Emergency Backup (GitHub Actions)**:
  - Workflow: `.github/workflows/scheduler.yml`.
  - Trigger: `workflow_dispatch` only (manual trigger from GitHub Actions tab).
  - Fail-closed: Exits with non-zero code if `CRON_SECRET` repository secret is missing.
  - Passes `Authorization: Bearer $CRON_SECRET` and `X-Scheduler-Source: github-manual`.

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

> **⚠️ SECURITY — Read before deploying to production**
>
> - **Generate `ADMIN_PASSWORD_HASH` locally** using `node scripts/hash-password.mjs <your_password>` on your own machine. Never generate or share your production password in chat, messages, email, or anywhere outside your local terminal.
> - **Use a strong, unique production password** — at minimum 20 random characters. Never reuse a password that was previously shared in any conversation, chat session, source code, or commit history.
> - **Only store the resulting hash** (`salt:hash`) in Vercel environment variables. The plain-text password must never leave your terminal.
> - If you suspect a password has ever been exposed or shared, regenerate it immediately using the script above and redeploy.

1. Push code to your GitHub repository (`hntt2510/aff_Thread`).
2. In the Vercel dashboard, import the project.
3. Add the following Environment Variables in Vercel Project Settings:
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH` (generate locally with `node scripts/hash-password.mjs`)
   - `SESSION_SECRET` (generate with `node scripts/generate-key.mjs`)
   - `THREADS_TOKEN_ENCRYPTION_KEY` (generate with `node scripts/generate-key.mjs`)
   - `CRON_SECRET` (generate with `node scripts/generate-key.mjs` for scheduler authentication)
   - `DATABASE_URL` (pointing to a production serverless PostgreSQL like Neon or Supabase)
4. Run migrations using `npm run db:migrate` against the database. Committed migrations in `src/db/migrations` are the single source of truth. Application runtime assumes the deployed schema is migrated and avoids runtime DDL mutations.
