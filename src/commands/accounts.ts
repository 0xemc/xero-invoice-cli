import { Command } from 'commander';
import { XeroService } from '../xero-client.js';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');

export function registerAccountsCommand(program: Command) {
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

        const accountsResponse = await xeroClient.accountingApi.getAccounts(tenantId);
        let accounts = accountsResponse.body.accounts || [];

        if (options.filter) {
          accounts = accounts.filter(acc =>
            String(acc.type).toUpperCase() === options.filter.toUpperCase()
          );
        }

        if (options.search) {
          const query = options.search.toLowerCase();
          accounts = accounts.filter(acc =>
            acc.name?.toLowerCase().includes(query) ||
            acc.code?.toLowerCase().includes(query)
          );
        }

        if (options.json) {
          console.log(JSON.stringify(accounts, null, 2));
        } else {
          console.log(`Found ${accounts.length} account(s):\n`);

          const grouped = accounts.reduce((acc, account) => {
            const type = account.type || 'OTHER';
            if (!acc[type]) acc[type] = [];
            acc[type].push(account);
            return acc;
          }, {} as Record<string, any[]>);

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
}
