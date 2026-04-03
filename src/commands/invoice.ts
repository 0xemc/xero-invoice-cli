import { Command } from 'commander';
import { XeroService } from '../xero-client.js';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');

function displayInvoice(invoice: any) {
  console.log('═'.repeat(80));
  console.log(`INVOICE #${invoice.invoiceNumber || 'N/A'}`);
  console.log('═'.repeat(80));
  console.log(`Status: ${invoice.status}`);
  console.log(`Invoice ID: ${invoice.invoiceID}`);
  console.log('');

  console.log('📋 DETAILS');
  console.log('─'.repeat(80));
  console.log(`Contact: ${invoice.contact?.name || 'N/A'}`);
  console.log(`Date: ${invoice.date || 'N/A'}`);
  console.log(`Due Date: ${invoice.dueDate || 'N/A'}`);
  console.log(`Reference: ${invoice.reference || 'N/A'}`);
  console.log('');

  console.log('📦 LINE ITEMS');
  console.log('─'.repeat(80));

  if (invoice.lineItems && invoice.lineItems.length > 0) {
    invoice.lineItems.forEach((line: any, idx: number) => {
      console.log(`${idx + 1}. ${line.description || 'No description'}`);
      console.log(`   Account Code: ${line.accountCode || 'N/A'}`);
      console.log(`   Quantity: ${line.quantity || 0}`);
      console.log(`   Unit Amount: ${invoice.currencyCode || ''} ${line.unitAmount || '0.00'}`);
      console.log(`   Tax Amount: ${invoice.currencyCode || ''} ${line.taxAmount || '0.00'}`);
      console.log(`   Line Amount: ${invoice.currencyCode || ''} ${line.lineAmount || '0.00'}`);
      console.log('');
    });
  } else {
    console.log('No line items');
    console.log('');
  }

  console.log('💰 TOTALS');
  console.log('─'.repeat(80));
  console.log(`Subtotal: ${invoice.currencyCode || ''} ${invoice.subTotal || '0.00'}`);
  console.log(`Tax: ${invoice.currencyCode || ''} ${invoice.totalTax || '0.00'}`);
  console.log(`Total: ${invoice.currencyCode || ''} ${invoice.total || '0.00'}`);
  console.log(`Amount Due: ${invoice.currencyCode || ''} ${invoice.amountDue || '0.00'}`);
  console.log('');
}

export function registerInvoiceCommand(program: Command) {
  program
    .command('invoice [invoiceId]')
    .alias('get')
    .description('Fetch invoice(s) from Xero')
    .option('-l, --list', 'List all invoices (default if no invoiceId provided)')
    .option('-n, --number <number>', 'Filter by invoice number')
    .option('-c, --contact <name>', 'Filter by contact name')
    .option('-s, --status <status>', 'Filter by status (DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED)')
    .option('--limit <number>', 'Limit number of results (default: 10)', '10')
    .option('--json', 'Output as JSON')
    .action(async (invoiceId, options) => {
      try {
        const xeroService = new XeroService(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPES);

        if (!xeroService.isAuthenticated()) {
          console.error('❌ Not authenticated. Run: npm run auth');
          process.exit(1);
        }

        await xeroService.ensureValidToken();
        const xeroClient = xeroService.getClient();
        const tenantId = xeroService.getTenantId();

        if (invoiceId) {
          console.log(`Fetching invoice ${invoiceId}...\n`);
          const response = await xeroClient.accountingApi.getInvoice(tenantId, invoiceId);
          const invoice = response.body.invoices?.[0];

          if (!invoice) {
            console.error('❌ Invoice not found');
            process.exit(1);
          }

          if (options.json) {
            console.log(JSON.stringify(invoice, null, 2));
          } else {
            displayInvoice(invoice);
          }
        } else {
          console.log('Fetching invoices from Xero...\n');

          const response = await xeroClient.accountingApi.getInvoices(
            tenantId,
            undefined,
            undefined,
            undefined,
            undefined,
            options.number ? [options.number] : undefined,
            undefined,
            options.status ? [options.status.toUpperCase()] : undefined
          );

          let invoices = response.body.invoices || [];
          const limit = parseInt(options.limit);
          invoices = invoices.slice(0, limit);

          if (options.json) {
            console.log(JSON.stringify(invoices, null, 2));
          } else {
            console.log(`Found ${invoices.length} invoice(s):\n`);

            invoices.forEach((invoice, idx) => {
              console.log(`${idx + 1}. Invoice #${invoice.invoiceNumber || 'N/A'}`);
              console.log(`   ID: ${invoice.invoiceID}`);
              console.log(`   Contact: ${invoice.contact?.name || 'N/A'}`);
              console.log(`   Date: ${invoice.date || 'N/A'}`);
              console.log(`   Due Date: ${invoice.dueDate || 'N/A'}`);
              console.log(`   Status: ${invoice.status}`);
              console.log(`   Total: ${invoice.currencyCode || ''} ${invoice.total || '0.00'}`);
              console.log(`   Amount Due: ${invoice.currencyCode || ''} ${invoice.amountDue || '0.00'}`);
              console.log('');
            });

            console.log(`💡 Tip: Use 'npm run dev invoice <invoiceId>' to see full details`);
            console.log(`💡 Tip: Use --status DRAFT to see only draft invoices`);
            console.log(`💡 Tip: Use --json for machine-readable output\n`);
          }
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
