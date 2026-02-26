#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { XeroService } from './xero-client.js';
import { AccountingAPIClient } from 'xero-node';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');

const program = new Command();

program
  .name('xero-invoice')
  .description('CLI tool for creating Xero invoices from templates')
  .version('0.1.0');

// Command: List Account Codes (Line Item Types)
program
  .command('accounts')
  .alias('line-items')
  .description('List all account codes (line item types) from Xero')
  .option('-f, --filter <type>', 'Filter by account type (REVENUE, EXPENSE, etc.)')
  .option('-s, --search <query>', 'Search account names/codes')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const xeroService = new XeroService(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPES);

      if (!xeroService.isAuthenticated()) {
        console.error('❌ Not authenticated. Run: npm run auth');
        process.exit(1);
      }

      await xeroService.ensureValidToken();
      const xeroClient = xeroService.getClient();
      const tenantId = xeroService.getTenantId();

      console.log('Fetching account codes from Xero...\n');

      // Get accounts from Xero
      const accountsResponse = await xeroClient.accountingApi.getAccounts(tenantId);
      let accounts = accountsResponse.body.accounts || [];

      // Apply filters
      if (options.filter) {
        accounts = accounts.filter(acc =>
          acc.type?.toUpperCase() === options.filter.toUpperCase()
        );
      }

      if (options.search) {
        const query = options.search.toLowerCase();
        accounts = accounts.filter(acc =>
          acc.name?.toLowerCase().includes(query) ||
          acc.code?.toLowerCase().includes(query)
        );
      }

      // Output results
      if (options.json) {
        console.log(JSON.stringify(accounts, null, 2));
      } else {
        console.log(`Found ${accounts.length} account(s):\n`);

        // Group by type
        const grouped = accounts.reduce((acc, account) => {
          const type = account.type || 'OTHER';
          if (!acc[type]) acc[type] = [];
          acc[type].push(account);
          return acc;
        }, {} as Record<string, any[]>);

        // Display grouped accounts
        for (const [type, accts] of Object.entries(grouped)) {
          console.log(`\n📊 ${type}`);
          console.log('─'.repeat(60));

          accts.forEach(account => {
            const code = account.code || 'N/A';
            const name = account.name || 'Unnamed';
            const taxType = account.taxType || '';
            const status = account.status === 'ACTIVE' ? '✓' : '✗';

            console.log(`  ${status} ${code.padEnd(10)} ${name.padEnd(35)} ${taxType}`);
          });
        }

        console.log('\n');
        console.log(`💡 Tip: Use --filter REVENUE to see only revenue accounts`);
        console.log(`💡 Tip: Use --search "consulting" to search for specific accounts`);
        console.log(`💡 Tip: Use --json for machine-readable output\n`);
      }

    } catch (error: any) {
      console.error('❌ Error:', error.message);
      if (error.response) {
        console.error('Response:', error.response.body);
      }
      process.exit(1);
    }
  });

// Command: Show Connection Info
program
  .command('info')
  .description('Show connection information')
  .action(async () => {
    try {
      const xeroService = new XeroService(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPES);

      if (!xeroService.isAuthenticated()) {
        console.log('❌ Not authenticated\n');
        console.log('Run: npm run auth');
        process.exit(1);
      }

      await xeroService.ensureValidToken();
      const xeroClient = xeroService.getClient();
      const tenantId = xeroService.getTenantId();

      // Get organization info
      const orgResponse = await xeroClient.accountingApi.getOrganisations(tenantId);
      const org = orgResponse.body.organisations?.[0];

      console.log('\n✓ Connected to Xero\n');
      console.log('Organization:', org?.name);
      console.log('Tenant ID:', tenantId);
      console.log('Version:', org?.version);
      console.log('Base Currency:', org?.baseCurrency);
      console.log('\n');

    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
