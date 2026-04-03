import { Command } from 'commander';
import { XeroService } from '../xero-client.js';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');

export function registerUpdateCommand(program: Command) {
  program
    .command('update <invoiceNumber>')
    .description('Update an existing invoice')
    .option('-q, --quantity <number>', 'Update quantity for single line item invoices')
    .option('--add-line <description>', 'Add a line item (format: "description|quantity|unitAmount")')
    .option('--clear-lines', 'Clear all existing line items before adding new ones')
    .option('--json', 'Output as JSON')
    .action(async (invoiceNumber, options) => {
      try {
        const xeroService = new XeroService(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPES);

        if (!xeroService.isAuthenticated()) {
          console.error('❌ Not authenticated. Run: npm run auth');
          process.exit(1);
        }

        await xeroService.ensureValidToken();
        const xeroClient = xeroService.getClient();
        const tenantId = xeroService.getTenantId();

        console.log(`Looking up invoice ${invoiceNumber}...\n`);

        const invoicesResponse = await xeroClient.accountingApi.getInvoices(
          tenantId,
          undefined,
          undefined,
          undefined,
          undefined,
          [invoiceNumber]
        );

        const invoices = invoicesResponse.body.invoices || [];

        if (invoices.length === 0) {
          console.error(`❌ Invoice not found: ${invoiceNumber}`);
          process.exit(1);
        }

        const invoice = invoices[0];
        console.log(`Found invoice: ${invoice.invoiceNumber} (${invoice.status})\n`);

        let lineItems = options.clearLines ? [] : [...(invoice.lineItems || [])];

        if (options.quantity && lineItems.length === 1) {
          lineItems[0].quantity = parseFloat(options.quantity);
          console.log(`Updating quantity to ${options.quantity}...\n`);
        }

        if (options.addLine) {
          const lines = Array.isArray(options.addLine) ? options.addLine : [options.addLine];
          for (const line of lines) {
            const [description, quantity, unitAmount] = line.split('|');
            if (!description || !quantity || !unitAmount) {
              console.error(`❌ Invalid line format: ${line}`);
              console.error('Expected format: "description|quantity|unitAmount"');
              process.exit(1);
            }

            lineItems.push({
              description: description.trim(),
              quantity: parseFloat(quantity),
              unitAmount: parseFloat(unitAmount),
              accountCode: lineItems[0]?.accountCode || '200',
              taxType: lineItems[0]?.taxType || 'BASEXCLUDED',
              itemCode: lineItems[0]?.itemCode
            });
          }
        }

        if (lineItems.length === 0) {
          console.error('❌ No line items to update. Use --quantity or --add-line');
          process.exit(1);
        }

        const updatedInvoice = {
          invoiceID: invoice.invoiceID,
          lineItems: lineItems.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            accountCode: item.accountCode,
            taxType: item.taxType,
            itemCode: item.itemCode
          }))
        };

        const response = await xeroClient.accountingApi.updateInvoice(tenantId, invoice.invoiceID!, {
          invoices: [updatedInvoice]
        });

        const result = response.body.invoices?.[0];

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('✅ Invoice updated successfully!\n');
          console.log(`Invoice #: ${result?.invoiceNumber}`);
          console.log(`Status: ${result?.status}`);
          console.log(`Line items: ${result?.lineItems?.length}`);
          console.log(`Total: ${result?.currencyCode} ${result?.total}`);
          console.log('\nLine items:');
          result?.lineItems?.forEach((item: any, idx: number) => {
            console.log(`  ${idx + 1}. ${item.description}: ${item.quantity} × $${item.unitAmount} = $${item.lineAmount}`);
          });
          console.log('');
        }

      } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
          console.error('Response:', JSON.stringify(error.response.body, null, 2));
        }
        process.exit(1);
      }
    });
}
