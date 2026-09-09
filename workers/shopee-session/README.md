# Shopee Session Worker V1

Isolated external worker for interactive human-operator session management, weekly catalog acquisition, and direct affiliate link resolution.

## Architectural Boundaries

```
Vercel / Neon (Main App)
        ▲
        │ POST /api/internal/shopee/catalog-ingest
        │ Authorization: Bearer SHOPEE_WORKER_SECRET
        │ (Normalized Zod-validated payloads only)
        │
Shopee Session Worker (Local machine or dedicated worker VPS)
        │
        │ Playwright persistent browser context (Headed)
        ▼
Shopee Affiliate Portal (https://affiliate.shopee.vn)
```

### Strict Security Invariants
- **ZERO Headless Login**: Browser opens in visible headed mode for the operator.
- **ZERO Credential Automation**: Never prompts for, stores, or inputs Shopee passwords.
- **ZERO Cookie Leakage**: Shopee session cookies and localStorage stay strictly on the local machine in `.local/shopee-session/profile` and are **never** transmitted to Neon or Vercel.
- **ZERO CAPTCHA Bypassing**: When challenges or puzzles occur, the worker transitions to `CHALLENGE_REQUIRED` and pauses for human completion.
- **Strict HTTPS Domain Allowlist**: Only validated `s.shopee.vn` and approved Shopee domains are accepted for direct affiliate links.

---

## Session States

```
NOT_INITIALIZED ──► LOGIN_REQUIRED ──► AUTHENTICATING ──► READY
                          │                                 │
                          ▼                                 ▼
                  CHALLENGE_REQUIRED                     EXPIRED
                          │                                 │
                          └──────────────► ERROR ◄──────────┘
```

- `NOT_INITIALIZED`: Profile directory created, browser not yet inspected.
- `LOGIN_REQUIRED`: Operator needs to log in manually via `npm run shopee:login`.
- `AUTHENTICATING`: Browser is navigating and verifying session cookies.
- `READY`: Operator session is active; catalog pages are accessible.
- `CHALLENGE_REQUIRED`: Shopee verification / slider puzzle displayed. Operator must solve it in the browser.
- `EXPIRED`: Session has lapsed. Re-login required.
- `ERROR`: Network or browser automation failure.

---

## CLI Commands

### 1. Interactive Login
```bash
npm run shopee:login
```
Launches headed Chromium. Navigate to Shopee Affiliate, log in manually, solve any puzzle. Worker detects `READY` state and saves profile to `.local/shopee-session/profile`.

### 2. Check Session Status
```bash
npm run shopee:status
```
Checks whether the current local profile is still authenticated without disturbing user state.

### 3. Weekly Catalog & Link Acquisition
```bash
npm run shopee:weekly
```
Acquires candidate products (~50–70 items), resolves official direct affiliate links (`https://s.shopee.vn/...`), displays an interactive preview, and prompts for confirmation before ingesting to the Main App.

Flags:
- `--dry-run`: Runs acquisition, normalization, and saves local artifacts without sending to Main App.
- `--yes` or `-y`: Non-interactive auto-confirmation.
- `--skip-links`: Skips clicking "Get Link" modals (useful for rapid dry-run tests).

---

## Environment Variables

Configure in `workers/shopee-session/.env`:
```env
SHOPEE_WORKER_SECRET=your_32_character_shopee_worker_secret_here
SHOPEE_MAIN_APP_URL=http://localhost:3000
SHOPEE_WORKER_DRY_RUN=false
SHOPEE_PROFILE_DIR=.local/shopee-session/profile
SHOPEE_TARGET_CANDIDATES=60
SHOPEE_MAX_CANDIDATES=100
```
