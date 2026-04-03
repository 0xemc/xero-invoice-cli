---
name: xero-invoice
description: CLI tool for managing Xero invoices and account codes. Use when creating invoices from templates, listing invoices, fetching account codes, or checking Xero connection status.
---

# Xero Invoice CLI

Located at the project root. Run with `npm run dev <command>` in development or `npm start <command>` after building.

## Authentication

### Xero
1. Create a Xero app at https://developer.xero.com/myapps (Web app, redirect URI: `http://localhost:3000/callback`)
2. Add credentials to `.env`:
   ```
   CLIENT_ID=your_client_id
   CLIENT_SECRET=your_client_secret
   ```
3. Run `npm run auth` — opens browser for OAuth, saves tokens locally

**Headless/server:** Use `npm run auth -- --manual` — prints the consent URL, then prompts you to paste either the full redirect URL or just the `code` value from it.

### Google Calendar
1. Create credentials at https://developers.google.com/calendar/api/quickstart/nodejs
2. Save as `gcal-credentials.json` (see `gcal-credentials.example.json` for format)
3. First calendar command opens browser for auth automatically

**Headless/server:**
```bash
npm run dev calendar-auth              # prints auth URL
GCAL_AUTH_CODE=<code> npm run dev calendar --today  # completes auth
```

## Commands

### Invoices

```bash
npm run dev invoice
npm run dev invoice --limit 20
npm run dev invoice --status PAID       # DRAFT, AUTHORISED, PAID
npm run dev invoice <invoice-id>
npm run dev invoice <invoice-id> --json
```

### Items & Accounts

```bash
npm run dev items
npm run dev items --search "coaching"
npm run dev accounts
npm run dev accounts --filter REVENUE
npm run dev accounts --search "consulting"
```

### Organisations

```bash
npm run dev -- orgs                # list orgs, show active
npm run dev -- orgs --use 2        # switch to org #2
```

Templates specify `orgTenantId` to auto-switch org when creating invoices.

### Create Invoice from Template

```bash
npm run dev create chess-coaching
npm run dev create chess-coaching -n CC-101
npm run dev create chess-coaching -q 4
npm run dev create chess-coaching -d 2026-03-01
npm run dev create chess-coaching --submit
```

### Create Invoice from Calendar Events

Fetches events from Google Calendar, matches each against `lineItemPatterns` in the template, and creates one line item per matched event. Description format: `DD/MM/YYYY - {pattern.description}`.

```bash
# Dry run first to preview matches
npm run dev create-from-calendar chess-coaching \
  --calendar "Chess Club Jiu Jitsu" \
  --start 2026-03-27 \
  --end 2026-04-03 \
  --query "[chess]" \
  --dry-run

# Create the invoice
npm run dev create-from-calendar chess-coaching \
  --calendar "Chess Club Jiu Jitsu" \
  --start 2026-03-27 \
  --end 2026-04-03 \
  --query "[chess]"
```

Options: `-c/--calendar`, `-s/--start`, `-e/--end`, `-q/--query`, `-n/--invoice-number`, `-d/--date`, `--submit`, `--dry-run`

See `docs/line-item-patterns.md` for full pattern syntax and template configuration.

### Update Invoice

```bash
npm run dev update CC-42 -q 5
npm run dev update CC-42 --add-line "Extra session|1|75"
npm run dev update CC-42 --clear-lines --add-line "New item|1|100"
```

### Calendar

```bash
npm run dev calendar --today
npm run dev calendar --week
npm run dev calendar --start 2026-03-27 --end 2026-04-03
npm run dev calendar --calendar "Chess Club Jiu Jitsu" --start 2026-03-27 --end 2026-04-03
npm run dev calendar --list-calendars
```

### Connection Info

```bash
npm run dev info
```

## Token Management

Xero tokens are saved in `tokens.json` and auto-refreshed. Re-run `npm run auth` if expired.
Google Calendar tokens are saved in `gcal-token.json`. Set `REQUIRE_GCAL_REAUTH=true` in `.env` to force re-auth on every request.
