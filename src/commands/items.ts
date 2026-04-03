import { Command } from 'commander';
import { XeroService } from '../xero-client.js';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');

export function registerItemsCommand(program: Command) {
  program
    .command('items')
    .description('List all items (products/services) from Xero')
    .option('-s, --search <query>', 'Search item names/codes')
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

        console.log('Fetching items from Xero...\n');

        const itemsResponse = await xeroClient.accountingApi.getItems(tenantId);
        let items = itemsResponse.body.items || [];

        if (options.search) {
          const query = options.search.toLowerCase();
          items = items.filter(item =>
            item.name?.toLowerCase().includes(query) ||
            item.code?.toLowerCase().includes(query)
          );
        }

        if (options.json) {
          console.log(JSON.stringify(items, null, 2));
        } else {
          console.log(`Found ${items.length} item(s):\n`);

          items.forEach(item => {
            const code = item.code || 'N/A';
            const name = item.name || 'Unnamed';
            const salesPrice = item.salesDetails?.unitPrice || 'N/A';
            const purchasePrice = item.purchaseDetails?.unitPrice || 'N/A';
            const accountCode = item.salesDetails?.accountCode || 'N/A';

            console.log(`\n📦 ${code} - ${name}`);
            console.log(`   Sales Price: $${salesPrice}`);
            console.log(`   Purchase Price: $${purchasePrice}`);
            console.log(`   Account Code: ${accountCode}`);
            console.log(`   Description: ${item.description || 'N/A'}`);
          });

          console.log('\n');
          console.log(`💡 Tip: Use --search "consulting" to search for specific items`);
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
