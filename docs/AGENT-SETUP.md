# Set up Ikigai Finance — agent playbook

This is a copy-pasteable playbook for an AI coding agent (or a technical
founder) to stand up **Ikigai Finance** for one company, fast. It is tiered:
**Tier 0 gets a real, persistent financial dashboard running entirely on the
user's machine with no online account of any kind.** Each later tier adds one
optional capability. Do the tiers in order; stop when the user has what they
need.

Ground rules while you work:

- Never invent a financial number, an email, or a secret. Ask the user for
  their real company figures; leave anything unknown blank.
- Never commit `.dev.vars`, `.wrangler/`, or a real company's data. Both are
  gitignored — keep them that way.
- After any code change, keep `npm test`, `npm run lint`, `npm run build`, and
  `npm run audit:boundary` green.

---

## Prerequisites

- **Node.js 22 or newer** and **npm**. Check: `node -v`.
- That is all Tier 0 needs. No Docker, no database server, no cloud account.

```bash
git clone https://github.com/Nonarkara/ikigai-finance.git
cd ikigai-finance
npm install
```

---

## Tier 0 — A real local dashboard, no accounts (start here)

**Goal:** the company's balance sheet, income statement, financial diagnostic,
workspace, and reference profiles, persisting to a **local SQLite database** on
the user's own disk. Fully offline. This is enough for most SMEs.

**What is NOT in Tier 0:** receipt OCR, Telegram intake, Google sign-in, and
Google Sheets sync. Those need external services and are Tiers 1–3. The
financial model itself needs none of them — the user types or pastes their
numbers and the app does the rest.

### 1. Create local secrets

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set two values. Generate a strong session secret:

```bash
# prints a value to paste into SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

In `.dev.vars`:

```
SESSION_SECRET=<the value you just generated>
APP_PASSWORD=<a password the owner will type to sign in>
```

Leave `GOOGLE_*`, `TELEGRAM_*`, and `GOOGLE_SHEETS_*` blank for now. The empty
Google allowlist means the app shows the password sign-in form.

### 2. Create the local database

```bash
npm run db:local
```

This applies every migration in `migrations/` to a local SQLite file under
`.wrangler/state`. There is no server to install and nothing leaves the
machine. Re-running it is safe — applied migrations are skipped.

### 3. Run the persistent local app

```bash
npm run start:local
```

This builds the app and runs it in Cloudflare's local runtime with the local
database, R2, and KV bindings all emulated on disk. Open
<http://localhost:3000>, sign in with `APP_PASSWORD`, open **Workspace**, and
enter the company's real details. **Saves persist** — stop and restart and the
data is still there.

> `npm run dev` is a different, faster mode for UI work only: it shows clearly
> labeled **synthetic** data and persists nothing. Use `npm run start:local`
> for the real, persistent app.

### 4. Verify persistence

Enter a value in Workspace, stop the process (`Ctrl+C`), run
`npm run start:local` again, and confirm the value is still there. If it is,
Tier 0 is done and the user has a working local financial cockpit.

### Reset the local database (if ever needed)

```bash
rm -rf .wrangler/state && npm run db:local
```

This wipes local data only. It never touches a deployed database.

---

## Tier 1 — Google sign-in (optional)

Adds real Google accounts + an owner allowlist instead of a shared password.

1. In [Google Cloud Console](https://console.cloud.google.com/) create an OAuth
   2.0 Client (type: Web application).
2. Add the authorized redirect URI: `http://localhost:3000/api/auth/google/callback`.
3. In `.dev.vars` set:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   OWNER_EMAILS=owner@example.com
   AUTH_URL=http://localhost:3000
   ```
4. Restart `npm run start:local`. The login page now shows the Google button.
   Only emails in `OWNER_EMAILS` can sign in; an empty list blocks everyone.

Keep `APP_PASSWORD` set if the owner still wants the password form as a fallback.

---

## Tier 2 — Receipt intake via Telegram + OCR (needs Cloudflare)

The evidence pipeline (photograph a receipt → OCR proposal → human approves)
uses **Cloudflare Workers AI**, which has no local emulation. This tier
therefore requires a Cloudflare account and a deploy (Tier 4). Set it up only
if the user wants automated receipt capture; the core dashboard does not need
it.

At a high level: create a Telegram bot with **@BotFather**, set
`TELEGRAM_BOT_TOKEN` and a `TELEGRAM_WEBHOOK_SECRET`, deploy (Tier 4), then
point the bot webhook at `https://<your-deployment>/api/telegram`. Pair a
sender with the one-time code shown in the app. Every extracted field is a
**proposal** a human must approve — never auto-approved.

---

## Tier 3 — Google Sheets mirror (optional)

An editable two-way mirror of the single company in one Google Sheet.

1. Open the company workbook → **Extensions → Apps Script**.
2. Paste [`scripts/google-apps-script-bridge.gs`](../scripts/google-apps-script-bridge.gs).
3. Run `setupIkigaiFinance()` once; enter the dashboard URL and a random secret
   of 24+ characters.
4. Deploy the script as a web app that executes as you; copy its `/exec` URL.
5. Set `GOOGLE_SHEETS_APP_URL` and `GOOGLE_SHEETS_SYNC_SECRET` (same secret) in
   `.dev.vars` or your Cloudflare secrets.

Dashboard saves push to the Sheet; Sheet edits push to `/api/sheets/sync`.
Stale writes are rejected; locking the model blocks edits on both sides.

---

## Tier 4 — Deploy to the internet (Cloudflare)

Only when the user wants the dashboard reachable from a browser anywhere.

```bash
npx wrangler login
npx wrangler d1 create ikigai-finance
npx wrangler r2 bucket create ikigai-finance-evidence
npx wrangler r2 bucket create ikigai-finance-cache
npx wrangler kv namespace create PAIRING_KV
```

Put the returned **database_id** and bucket/namespace names into `wrangler.jsonc`
(replace every `replace-me-*` and the all-zero id), then:

```bash
npx wrangler d1 migrations apply ikigai-finance --remote
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
# plus OWNER_EMAILS, AUTH_URL, and any Telegram / Sheets secrets in use
npm run deploy
```

The `--local` database and the `--remote` database are completely separate. A
local reset never affects production, and vice versa.

---

## What is ready, and what to add before real money

Be honest with the user about the trust boundary. This tool is production-ready
as an **evidence-and-diagnostic cockpit**, not as a system of record for
audited accounts.

**Ready now:** the evidence trust chain (nothing is approved by OCR alone), the
balance-sheet invariant (an unbalanced statement blocks the conclusion), missing
inputs staying missing, single-owner access control that fails closed, signed
Telegram webhooks, and SHA-256 provenance on stored originals.

**Add before you rely on the numbers for money decisions:**

1. **A bank import + month-close.** An approved receipt is not a reconciled bank
   transaction. Authoritative cash needs a statement import and a close step.
2. **Backups of the database.** For local Tier 0, copy `.wrangler/state`
   somewhere safe on a schedule; for Cloudflare, use D1's export/backup.
3. **A second reviewer** for high-value approvals if more than one person runs
   the business.

Say which tier the user is on in plain language. "This is a local evidence
cockpit" is a complete, honest sentence. Do not describe it as accounting-grade
until a bank reconciliation exists.

---

## Fast reference

| Command | What it does |
|---|---|
| `npm install` | install dependencies |
| `npm run db:local` | create / migrate the local SQLite database |
| `npm run start:local` | run the real, persistent app locally (offline) |
| `npm run dev` | fast UI mode, synthetic data, no persistence |
| `npm test` / `npm run lint` / `npm run build` | verification |
| `npm run audit:boundary` | public-repo safety scan (run before any push) |
| `npm run deploy` | deploy to Cloudflare (Tier 4) |
