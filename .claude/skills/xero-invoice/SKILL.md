---
name: xero-invoice
description: CLI tool for managing Xero invoices and account codes. Use when creating invoices from templates, listing invoices, fetching account codes, or checking Xero connection status.
---

# Xero Invoice CLI

Located at the project root. Run with `npm run dev <command>` in development or `npm start <command>` after building.

## Authentication

First-time setup:
1. Create a Xero app at https://developer.xero.com/myapps (Web app, redirect URI: `http://localhost:3000/callback`)
2. Add credentials to `.env`:
   ```
   CLIENT_ID=your_client_id
   CLIENT_SECRET=your_client_secret
   ```
3. Run `npm run auth` — opens browser for OAuth, saves tokens locally

## Commands

### Invoices

```bash
# List recent invoices
npm run dev invoice

# List with options
npm run dev invoice --limit 20
npm run dev invoice --status PAID       # or DRAFT, AUTHORISED
npm run dev invoice <invoice-id>        # specific invoice
npm run dev invoice <invoice-id> --json # JSON output
```

### Account Codes

```bash
npm run dev accounts
npm run dev accounts --filter REVENUE
npm run dev accounts --search "consulting"
npm run dev accounts --json
```

### Create Invoice from Template

Templates live in the project (e.g. `chess-coaching`). Invoice numbers auto-increment.

```bash
npm run dev create chess-coaching
npm run dev create chess-coaching -n CC-101        # manual number
npm run dev create chess-coaching -n CC-102 -q 4  # override quantity
npm run dev create chess-coaching -d 2026-03-01   # custom date
npm run dev create chess-coaching --submit         # submit immediately (skip draft)
```

### Connection Info

```bash
npm run dev info
```

## Token Management

Tokens are saved locally and auto-refreshed. If authentication expires, re-run `npm run auth`.
