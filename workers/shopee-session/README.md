# Shopee Session Worker V1

Isolated external worker for interactive human-operator session management, weekly catalog acquisition, and direct affiliate link resolution using a dedicated local Google Chrome profile.

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
        │ Real installed Google Chrome (dedicated profile: .local/shopee-chrome-profile)
        │ Connected via Playwright CDP (http://127.0.0.1:9222)
        ▼
Shopee Affiliate Portal (https://affiliate.shopee.vn)
```

### Strict Security Invariants
- **Real Google Chrome Executable**: Auto-discovers installed Google Chrome on host (Windows, macOS, Linux). Never uses bundled Playwright Chromium that triggers anti-bot.
- **Dedicated Profile Isolation**: Runs exclusively in `.local/shopee-chrome-profile` (strictly gitignored). Never touches personal/default Chrome profiles (`User Data`).
- **ZERO Credential Automation**: Never prompts for, stores, or inputs Shopee passwords. Operator logs in manually.
- **ZERO Cookie Leakage**: Shopee session cookies and localStorage stay strictly on the local machine in `.local/shopee-chrome-profile` and are **never** transmitted to Neon or Vercel.
- **ZERO Anti-bot / CAPTCHA Bypassing**: When challenges or puzzles occur, the worker transitions to `CHALLENGE_REQUIRED` and pauses for human completion in the Chrome window.
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
- `AUTHENTICATING`: Browser is navigating and verifying session state.
- `READY`: Operator session is active; catalog and dashboard pages are accessible.
- `CHALLENGE_REQUIRED`: Shopee verification / slider puzzle / OTP displayed. Operator must solve it manually in Chrome.
- `EXPIRED`: Session has lapsed. Re-login required.
- `ERROR`: Network or browser connection failure.

---

## CLI Commands

### 1. Interactive Login
```bash
npm run shopee:login
```
Launches real Google Chrome with the dedicated profile. Navigate to Shopee Affiliate, log in manually, solve any puzzle. Worker detects `READY` state and keeps session active until Ctrl+C. Profile is saved to `.local/shopee-chrome-profile`.

### 2. Check Session Status
```bash
npm run shopee:status
```
Checks whether the dedicated local Chrome profile is still authenticated without disturbing user state.

### 3. Weekly Catalog & Link Acquisition
```bash
npm run shopee:weekly
```
Acquires candidate products, resolves official direct affiliate links (`https://s.shopee.vn/...`), displays an interactive preview, and prompts for confirmation before ingesting to the Main App.

Flags:
- `--dry-run`: Runs acquisition, normalization, and saves local artifacts without sending to Main App (defaults to 3-5 candidates for fast dry-run inspection).
- `--yes` or `-y`: Non-interactive auto-confirmation.
- `--skip-links`: Skips clicking "Get Link" modals.

---

## Environment Variables

Configure in `workers/shopee-session/.env`:
```env
SHOPEE_WORKER_SECRET=your_32_character_shopee_worker_secret_here
SHOPEE_MAIN_APP_URL=http://localhost:3000
SHOPEE_WORKER_DRY_RUN=false
SHOPEE_CHROME_PROFILE_DIR=.local/shopee-chrome-profile
# Optional explicit Chrome binary override
# CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
SHOPEE_TARGET_CANDIDATES=60
SHOPEE_MAX_CANDIDATES=100
```
