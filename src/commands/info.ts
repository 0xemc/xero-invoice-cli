import { Command } from 'commander';
import { XeroService } from '../xero-client.js';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');

export function registerInfoCommand(program: Command) {
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
}
