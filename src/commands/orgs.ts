import { Command } from 'commander';
import { XeroService } from '../xero-client.js';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');

export function registerOrgsCommand(program: Command) {
  program
    .command('orgs')
    .description('List available Xero organisations and optionally switch active org')
    .option('--use <index>', 'Switch to org by number (1-based)')
    .action(async (options) => {
      try {
        const xeroService = new XeroService(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPES);

        if (!xeroService.isAuthenticated()) {
          console.error('❌ Not authenticated. Run: npm run auth');
          process.exit(1);
        }

        await xeroService.ensureValidToken();
        const tenants = await xeroService.listTenants();

        if (tenants.length === 0) {
          console.error('❌ No organisations found');
          process.exit(1);
        }

        const currentTenantId = xeroService.getTenantId();

        console.log('\nAvailable organisations:\n');
        tenants.forEach((t, i) => {
          const active = t.tenantId === currentTenantId ? ' ◀ active' : '';
          console.log(`  ${i + 1}. ${t.tenantName} (${t.tenantId})${active}`);
        });

        if (options.use) {
          const idx = parseInt(options.use) - 1;
          if (idx < 0 || idx >= tenants.length) {
            console.error(`\n❌ Invalid index. Choose 1–${tenants.length}`);
            process.exit(1);
          }
          const chosen = tenants[idx];
          xeroService.setTenantId(chosen.tenantId);
          console.log(`\n✓ Switched to: ${chosen.tenantName}`);
        }

        console.log('');
      } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }
    });
}
