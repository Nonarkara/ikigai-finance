# Ikigai Finance

A small, open-source financial cockpit for one company — founders and small teams. Send a receipt, invoice, boarding pass, itinerary, or claim document to Telegram; the app stores the original privately, extracts structured fields, and waits for a human to approve or reject the proposal. It also holds an evidence-first balance-sheet and income-statement diagnostic for the company you run.

This is a focused vertical slice, not a general ledger or bank-reconciliation system.

**Setting it up for a business?** Follow the tiered, copy-pasteable
[agent setup playbook](docs/AGENT-SETUP.md) — Tier 0 gets a real, persistent
dashboard running entirely on your own machine with **no cloud account**.

## What works

- Google OAuth sign-in (recommended) with a deployment-configured owner allowlist
- Password-protected fallback for local development without Google credentials
- Synthetic local data immediately after clone
- Telegram sender pairing with a one-time setup code
- Signed Telegram webhook verification
- Image and PDF ingestion up to 20 MB
- Cloudflare Workers AI extraction
- Private R2 original-file storage
- SHA-256 evidence provenance
- D1 review state and duplicate-update protection
- Human approve/reject workflow
- Evidence-first balance-sheet and income-statement diagnostic
- Formula lineage, input completeness, and balance-equation verification
- Editable and lockable single-company financial model
- Authenticated two-way Google Sheets sync with revision conflict protection
- Workspace (your company) edit-in-place
- Reference profiles for competitors, clients, partners, and prospects with a moves timeline
- Responsive desktop and mobile UI
- Tests, lint, build, CI, and public-boundary scan

## Trust model

`original evidence → OCR proposal → human review → approved evidence`

OCR never approves itself. An approved receipt still is not a reconciled bank transaction. If you need accounting-grade cash, add a bank import and month-close workflow before deriving authoritative balances.

The financial model follows a second invariant:

```text
total assets = total liabilities + total equity
```

If the statement does not balance, the app blocks the conclusion. Missing
numbers remain missing: it does not invent paid-in capital, assume a gross
margin, cap an undefined ratio, or silently choose an Altman model.

## Single-owner by design

The app is intentionally a single-company business OS, not a multi-tenant SaaS. There is one workspace (your company) and any number of read-only reference profiles. Each deployment supplies its own comma-separated `OWNER_EMAILS` allowlist; an empty list fails closed. Password sign-in is a developer-mode fallback for local development and clones that do not configure Google.

## Run locally

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/Nonarkara/ikigai-finance.git
cd ikigai-finance
npm install
cp .dev.vars.example .dev.vars
```

Set `SESSION_SECRET` and either `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `OWNER_EMAILS` (recommended) or `APP_PASSWORD` (developer fallback):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). This fast mode shows clearly labeled synthetic evidence and **persists nothing** — it is for UI work.

### Run locally with a real database (no Cloudflare account)

To actually use the dashboard for your company — saving your real balance
sheet, income statement, and workspace to a **local SQLite database** on your
own disk, fully offline — create the local database once and run the
persistent app:

```bash
npm run db:local       # applies the schema to a local SQLite file under .wrangler/state
npm run start:local    # builds and runs the app on the local database, offline
```

Open [http://localhost:3000](http://localhost:3000), sign in with
`APP_PASSWORD`, and edit **Workspace**. Saves persist across restarts. Nothing
leaves the machine and no online account is required. Reset anytime with
`rm -rf .wrangler/state && npm run db:local`. The full walkthrough, including
optional Google sign-in, Telegram receipt intake, and deployment, is in the
[agent setup playbook](docs/AGENT-SETUP.md).

## Connect one Google Sheet

The Sheet is an optional editable mirror of the single company. A Sheet link by
itself cannot grant secure access, so the repository includes a bound Apps
Script bridge:

1. Create or open the company workbook.
2. Open **Extensions → Apps Script** and paste
   [`scripts/google-apps-script-bridge.gs`](scripts/google-apps-script-bridge.gs).
3. Run `setupIkigaiFinance()` once. Enter the deployed dashboard URL and a
   random sync secret of at least 24 characters.
4. Deploy the script as a web app that executes as you. Copy its `/exec` URL.
5. Set `GOOGLE_SHEETS_APP_URL` to that URL and
   `GOOGLE_SHEETS_SYNC_SECRET` to the same secret in `.dev.vars` or Cloudflare
   secrets.

The setup function creates canonical Company Profile, Balance Sheet, and Income
Statement tabs and installs an authorized edit trigger plus a ten-minute
fallback trigger. Dashboard saves push back to the Sheet. Sheet edits push to
`/api/sheets/sync`. Revision checks reject stale writes, and locking the model
blocks both dashboard and Sheet edits until the owner unlocks it.

The web app has no `doGet` data export. Every incoming write must carry the
shared secret. Keep the deployment URL and secret private.

## Financial diagnostic

Paste the basic statement into the dashboard or call:

```bash
curl --request POST http://localhost:3000/api/finance/evaluate \
  --header 'Content-Type: application/json' \
  --data '{
    "companyName": "Example SME",
    "currency": "USD",
    "balanceSheet": {
      "totalCurrentAssets": 250000,
      "totalAssets": 600000,
      "totalCurrentLiabilities": 100000,
      "totalLiabilities": 200000,
      "equity": 400000
    }
  }'
```

The response separates what the balance sheet can prove from what still needs
income, cash-flow, market, governance, and deal-term evidence. Altman Z′ or Z″
is calculated only when the caller explicitly chooses the matching private
manufacturing or non-manufacturing model.

## Configure Cloudflare

Create the resources:

```bash
npx wrangler d1 create ikigai-finance
npx wrangler r2 bucket create ikigai-finance-evidence
npx wrangler r2 bucket create ikigai-finance-cache
npx wrangler kv namespace create PAIRING_KV
```

Put the returned IDs and names into `wrangler.jsonc`, replacing every `replace-me-*` name and all-zero ID, then apply the schema:

```bash
npx wrangler d1 migrations apply ikigai-finance --remote
```

Create high-entropy secrets:

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put OWNER_EMAILS
npx wrangler secret put APP_PASSWORD            # optional, fallback sign-in
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_SETUP_CODE
npx wrangler secret put GOOGLE_SHEETS_APP_URL       # optional
npx wrangler secret put GOOGLE_SHEETS_SYNC_SECRET   # optional
```

When deploying behind a tunnel or alternate host, also set:

```bash
npx wrangler secret put AUTH_URL               # e.g. https://your-domain.example
```

Deploy:

```bash
npm run deploy
```

## Configure Telegram

Create a bot with BotFather. After deployment, register the webhook using the same random value stored as `TELEGRAM_WEBHOOK_SECRET`:

```bash
curl --request POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  --data-urlencode "url=https://YOUR_DOMAIN/api/telegram" \
  --data-urlencode "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  --data-urlencode 'allowed_updates=["message"]'
```

In Telegram, pair the first authorized sender:

```text
/start YOUR_TELEGRAM_SETUP_CODE
```

The paired chat/user is stored in KV. Unknown senders cannot submit evidence. To reset pairing:

```bash
npx wrangler kv key delete --binding PAIRING_KV paired_sender --remote
```

## Extracted fields

Image OCR proposes raw text, document type, vendor, date, currency, subtotal, tax, total, invoice number, booking reference, passenger, flight, route, claim category, line items, confidence, and warnings. PDF conversion preserves extracted text and deliberately starts at medium confidence for human review.

## Verify a change

```bash
npm test
npm run lint
npm run build
npm run audit:boundary
npm audit
```

## Architecture

- Next.js 16 / React 19
- Cloudflare Workers through OpenNext
- D1 for evidence metadata, workspace, and reference profiles
- D1 revisioned financial snapshot and sync audit events
- R2 for private originals
- KV for Telegram pairing
- Workers AI for OCR and PDF-to-Markdown

The project intentionally retains edge `middleware.js`: Next 16's new `proxy.js` is Node-runtime only, and the current OpenNext Cloudflare adapter does not support Node middleware yet.

The app is intentionally single-workspace. There is one operating company and any number of read-only reference profiles (competitors, clients, partners, prospects). Reference profiles do not own their own data, OAuth credentials, or finance ledger; they exist so the cockpit has a stable comparison surface. Multi-company support requires tenant-scoped keys, memberships, connection ownership, and an explicit authorization policy; do not simulate it by adding a tenant dropdown alone.

## Security and privacy

Original files are never public bucket URLs. They stream through a session-protected route with `private, no-store`. Runtime credentials belong in Cloudflare secrets or ignored `.dev.vars` files.

See [SECURITY.md](SECURITY.md) before operating with real evidence.

## Roadmap

1. Editable extracted fields and an audit event for every correction.
2. Bank CSV import, matching, and month close.
3. Retention rules and evidence export bundles.
4. End-to-end browser and deployed-binding tests.

## License

MIT. See [LICENSE](LICENSE).
