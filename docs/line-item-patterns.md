# Line Item Pattern Matching

## Overview

Line item pattern matching allows you to automatically create invoices from calendar events by mapping event titles to specific line item configurations. This is useful when you have recurring events with different types that should map to different invoice line items.

## Template Configuration

Add a `lineItemPatterns` array to your template JSON file. Each pattern defines:

- **id**: Unique identifier for the pattern
- **pattern**: Regular expression to match against event titles (case-insensitive)
- **description**: Description for the invoice line item
- **itemCode**: Xero item code
- **accountCode**: Xero account code
- **unitAmount** (optional): Price per unit - if omitted, Xero uses the default price from the item
- **taxType**: Tax type (e.g., "BASEXCLUDED")

### Example Template

```json
{
  "name": "Chess Club Coaching Services",
  "invoicePrefix": "CC-",
  "contact": {
    "name": "Chess Club Jiu-Jitsu Ltd Pty"
  },
  "lineItemPatterns": [
    {
      "id": "kids-8-plus",
      "pattern": "kids 8\\+|Kids 8\\+",
      "description": "[chess] Kids 8+",
      "itemCode": "MAR-1-5",
      "accountCode": "200",
      "taxType": "BASEXCLUDED"
    },
    {
      "id": "beginners",
      "pattern": "beginners",
      "description": "[chess] Beginners",
      "itemCode": "MAR-1-5",
      "accountCode": "200",
      "taxType": "BASEXCLUDED"
    },
    {
      "id": "special-workshop",
      "pattern": "workshop",
      "description": "[chess] Special Workshop",
      "itemCode": "WORKSHOP",
      "accountCode": "200",
      "unitAmount": 150,
      "taxType": "BASEXCLUDED"
    }
  ]
}
```

**Note:** In this example, "kids-8-plus" and "beginners" will use the default price from the `MAR-1-5` item in Xero, while "special-workshop" overrides the item price with $150.

## Pattern Syntax

Patterns use JavaScript regular expressions:

- **Literal text**: `"beginners"` matches "beginners" anywhere in the title
- **Case insensitive**: All patterns are automatically case-insensitive
- **Multiple options**: `"kids 8\\+|Kids 8\\+"` matches either variation
- **Wildcards**: `"Kids.*Gi"` matches "Kids" followed by anything, then "Gi"
- **Negative lookahead**: `"Kids(?! 8\\+)"` matches "Kids" but not "Kids 8+"
- **Special characters**: Escape with `\\` (e.g., `\\+` for literal `+`)

### Pattern Matching Order

Patterns are evaluated in the order they appear in the template. The first matching pattern wins, so:

1. Put more specific patterns first
2. Put more general patterns last
3. Use negative lookahead for exclusions

Example:
```json
[
  {"id": "kids-8-plus", "pattern": "kids 8\\+"},
  {"id": "kids-4-7", "pattern": "Kids 4-7"},
  {"id": "kids-gi", "pattern": "Kids.*Gi"},
  {"id": "kids-general", "pattern": "Kids(?! 8\\+)(?! 4-7)(?!.*Gi)"}
]
```

## Using the Command

### Basic Usage

```bash
npm run dev create-from-calendar chess-coaching \
  --calendar "Chess Club Jiu Jitsu" \
  --start 2026-03-27 \
  --end 2026-04-03 \
  --query "[chess]"
```

### Options

- `-c, --calendar <name>` - Calendar name or ID (default: "primary")
- `-s, --start <date>` - Start date in YYYY-MM-DD format (default: "today")
- `-e, --end <date>` - End date in YYYY-MM-DD format (default: "today")
- `-q, --query <search>` - Search query for events (e.g., "[chess]")
- `-n, --invoice-number <number>` - Invoice number (auto-increments if not provided)
- `-d, --date <date>` - Invoice date (default: "today")
- `--draft` - Create as draft (default)
- `--submit` - Submit invoice immediately
- `--dry-run` - Preview without creating the invoice

### Dry Run Example

Always test with `--dry-run` first to see which events match:

```bash
npm run dev create-from-calendar chess-coaching \
  --calendar "Chess Club Jiu Jitsu" \
  --start 2026-03-27 \
  --end 2026-04-03 \
  --query "[chess]" \
  --dry-run
```

### Create Invoice Example

Once you're happy with the preview, remove `--dry-run`:

```bash
npm run dev create-from-calendar chess-coaching \
  --calendar "Chess Club Jiu Jitsu" \
  --start 2026-03-27 \
  --end 2026-04-03 \
  --query "[chess]"
```

## Line Item Format

Each matched event creates a line item with:

- **Description**: `{date} - {pattern.description}`
  - Example: `27/03/2026 - [chess] Kids 8+`
- **Quantity**: Always 1 (one session per event)
- **Unit Amount**: From the pattern configuration (or Xero item default if not set)
- **Account Code**: From the pattern configuration
- **Item Code**: From the pattern configuration
- **Tax Type**: From the pattern configuration

## Google Calendar Setup

### Interactive (with browser)
1. Create credentials at https://developers.google.com/calendar/api/quickstart/nodejs
2. Download as `gcal-credentials.json` (see `gcal-credentials.example.json`)
3. Run any calendar command — browser will open for auth

### Headless/Server
```bash
# Generate auth URL
npm run dev calendar-auth

# Run command with auth code
GCAL_AUTH_CODE=<your-code> npm run dev calendar --today
```

## Common Patterns

```javascript
// Exact match (case-insensitive)
"pattern": "Open Mat"

// Contains text
"pattern": "beginners"

// Multiple variations
"pattern": "kids 8\\+|Kids 8\\+"

// Wildcard matching
"pattern": "Kids.*Gi"          // "Kids 8+ Gi", "Kids Gi", etc.

// Negative lookahead (exclude specific text)
"pattern": "Kids(?! 8\\+)"     // "Kids" but not "Kids 8+"

// Special characters (need escaping)
"pattern": "kids 8\\+"         // Match literal "+"
"pattern": "\\[chess\\]"       // Match literal "[chess]"
```
