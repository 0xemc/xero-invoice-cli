# Xero Invoice CLI

CLI tool for creating Xero invoices from templates.

## Setup

### 1. Create a Xero App

1. Go to [Xero Developer Portal](https://developer.xero.com/myapps)
2. Click "New app"
3. Choose "Web app"
4. Set Redirect URI to: `http://localhost:3000/callback`
5. Copy your Client ID and Client Secret

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Authenticate with Xero

```bash
npm run auth
```

This will:
- Open your browser
- Ask you to log in to Xero
- Ask you to authorize the app
- Save your tokens locally

## Usage

### List Account Codes (Line Item Types)

```bash
# List all accounts
npm run dev accounts

# Filter by type
npm run dev accounts --filter REVENUE

# Search for specific accounts
npm run dev accounts --search "consulting"

# Output as JSON
npm run dev accounts --json
```

### Show Connection Info

```bash
npm run dev info
```

## Commands

- `npm run auth` - Authenticate with Xero
- `npm run dev` - Run CLI in development mode
- `npm run build` - Build for production
- `npm start` - Run built CLI

## Next Steps

- [ ] Add invoice template support
- [ ] Add invoice creation command
- [ ] Add batch invoice processing
- [ ] Add invoice status checking

## Resources

- [Xero API Documentation](https://developer.xero.com/documentation/)
- [Xero Node SDK](https://github.com/XeroAPI/xero-node)
- [OAuth 2.0 Guide](https://developer.xero.com/documentation/guides/oauth2/overview/)
