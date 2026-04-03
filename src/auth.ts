#!/usr/bin/env node
import 'dotenv/config';
import * as http from 'http';
import * as readline from 'readline';
import { XeroService } from './xero-client.js';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');
const PORT = parseInt(process.env.PORT || '3000');

const isManual = process.argv.includes('--manual');

async function authenticate() {
  const xeroService = new XeroService(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPES);

  if (xeroService.isAuthenticated()) {
    try {
      await xeroService.ensureValidToken();
      console.log('✓ Already authenticated and token is valid!');
      console.log('You can now use the CLI commands.');
      process.exit(0);
    } catch (err) {
      console.log('⚠ Existing token is invalid or expired — re-authenticating...\n');
      xeroService.clearTokens();
    }
  }

  console.log('\n🔐 Xero Authentication Required\n');

  const consentUrl = await xeroService.getConsentUrl();

  console.log('Copy and paste this URL into your browser:\n');
  console.log(consentUrl);
  console.log('\n');

  if (isManual) {
    console.log('After authorizing, your browser will fail to load the redirect URL.');
    console.log('Paste either the full URL from the address bar, or just the "code" value:\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const input: string = await new Promise(resolve => rl.question('> ', answer => { rl.close(); resolve(answer.trim()); }));

    try {
      let fullUrl: string;
      if (input.includes('://')) {
        // Full URL pasted — extract just the query string and rebase onto REDIRECT_URI
        const parsed = new URL(input);
        fullUrl = `${REDIRECT_URI}${parsed.search}`;
      } else {
        // Just the code pasted — reconstruct using stored state
        const state = xeroService.getLastState();
        fullUrl = `${REDIRECT_URI}?code=${encodeURIComponent(input)}&state=${encodeURIComponent(state)}`;
      }
      await xeroService.handleCallback(fullUrl);
      console.log('\n✓ Authentication successful!');
      console.log('You can now use the CLI commands.');
      process.exit(0);
    } catch (error) {
      console.error('Authentication error:', error);
      process.exit(1);
    }
  }

  // Create a temporary HTTP server to handle the OAuth callback
  const server = http.createServer(async (req, res) => {
    if (req.url?.startsWith('/callback')) {
      try {
        const fullUrl = `${REDIRECT_URI}${req.url.replace('/callback', '')}`;
        await xeroService.handleCallback(fullUrl);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              }
              .container {
                background: white;
                padding: 3rem;
                border-radius: 1rem;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 400px;
              }
              h1 { color: #13B5EA; margin-bottom: 1rem; }
              p { color: #666; line-height: 1.6; }
              .checkmark { font-size: 4rem; margin-bottom: 1rem; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="checkmark">✓</div>
              <h1>Authentication Successful!</h1>
              <p>You've successfully connected to Xero.</p>
              <p>You can now close this window and return to the terminal.</p>
            </div>
          </body>
          </html>
        `);

        console.log('\n✓ Authentication successful!');
        console.log('You can now use the CLI commands.');

        // Close server after successful auth
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);

      } catch (error) {
        console.error('Authentication error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Authentication failed. Check the terminal for details.');
        server.close();
        process.exit(1);
      }
    }
  });

  server.listen(PORT, () => {
    console.log(`Waiting for authentication on http://localhost:${PORT}/callback...\n`);

    // Try to open the browser automatically
    const open = (url: string) => {
      const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      require('child_process').exec(`${start} ${url}`);
    };

    try {
      open(consentUrl);
    } catch (e) {
      console.log('Could not open browser automatically.');
    }
  });

  // Handle timeout
  setTimeout(() => {
    console.log('\n⚠ Authentication timeout. Please try again.');
    server.close();
    process.exit(1);
  }, 5 * 60 * 1000); // 5 minutes
}

authenticate().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
