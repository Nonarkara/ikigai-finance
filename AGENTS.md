<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent guide — Ikigai Finance

You are helping someone stand up and run **Ikigai Finance**: a small,
open-source, **single-company** financial cockpit. One workspace (their
company), any number of read-only reference profiles. MIT licensed. It runs
fully locally with no cloud account, and optionally deploys to Cloudflare.

If the task is "set this up for my business", follow **[`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md)** —
a tiered, copy-pasteable playbook written for you to execute end to end.

## The three invariants — never break these

1. **Evidence before conclusion.** The trust chain is
   `original evidence → OCR proposal → human review → approved evidence`.
   OCR never approves itself. Do not write code that auto-approves a proposal,
   treats an extracted field as verified, or presents a receipt as a reconciled
   bank transaction.
2. **The balance sheet must balance.** `total assets = total liabilities + total equity`.
   If a statement does not balance, the app **blocks the conclusion** rather
   than showing a number. Preserve that. Never "fix" a diagnostic by relaxing
   this check.
3. **Missing numbers stay missing.** The app does not invent paid-in capital,
   assume a gross margin, cap an undefined ratio, or silently pick an Altman
   model. If an input is absent, the output says so. Do not fill gaps with
   plausible defaults — a fabricated number a founder trusts is worse than a
   blank.

## Single-owner by design

This is intentionally **not** multi-tenant SaaS. One company edits in place;
everything else is a read-only reference profile. Access is an `OWNER_EMAILS`
allowlist (Google sign-in) or an `APP_PASSWORD` fallback for local use. An
empty allowlist fails closed. Do not add tenant switching, cross-company reads,
or a way to widen the allowlist at runtime.

## How data is stored

- The database is **Cloudflare D1**, which is SQLite. Locally it runs as a real
  offline SQLite file under `.wrangler/state` — **no Cloudflare account
  required**. See the setup playbook.
- Schema lives in `migrations/*.sql` (plain SQLite). Add a new numbered
  migration; never edit an applied one.
- `.wrangler/` and `.dev.vars` are gitignored. Never commit local state,
  secrets, or a real company's data.

## Before you call anything done

Run all four and keep them green:

```bash
npm test                 # node:test unit tests
npm run lint             # eslint
npm run build            # next build
npm run audit:boundary   # public-repo safety scan — must pass before any push
```

`audit:boundary` is the guard that keeps private paths, secrets, and real
customer data out of this **public** repository. If you add a file, a config,
or an example, assume a stranger will read it. Never write an absolute path
from your own machine, a real email, a real API key, or a real company's
figures into a tracked file.

## Scope discipline

Touch only what the task needs. Do not refactor adjacent systems, remove
comments you do not understand, or add features that were not asked for. The
smallest correct change wins. When a change spans more than one file, describe
what you will preserve before you start.
