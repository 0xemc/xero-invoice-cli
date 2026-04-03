import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { XeroService } from '../xero-client.js';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');

export function registerCreateCommand(program: Command, __dirname: string) {
  program
    .command('create <template>')
    .description('Create invoice from template')
    .option('-n, --invoice-number <number>', 'Invoice number (auto-increments if not provided)')
    .option('-q, --quantity <number>', 'Quantity (overrides template default)')
    .option('-d, --date <date>', 'Invoice date (YYYY-MM-DD or "today")', 'today')
    .option('--draft', 'Create as draft (default)', true)
    .option('--submit', 'Submit invoice immediately')
    .action(async (template, options) => {
      try {
        const xeroService = new XeroService(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPES);

        if (!xeroService.isAuthenticated()) {
          console.error('❌ Not authenticated. Run: npm run auth');
          process.exit(1);
        }

        const templatePath = path.join(__dirname, '..', 'templates', `${template}.json`);

        if (!fs.existsSync(templatePath)) {
          console.error(`❌ Template not found: ${template}`);
          console.error(`Looking for: ${templatePath}`);
          process.exit(1);
        }

        const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
        console.log(`\n📋 Using template: ${templateData.name}\n`);

        await xeroService.ensureValidToken();

        if (templateData.orgTenantId && templateData.orgTenantId !== xeroService.getTenantId()) {
          xeroService.setTenantId(templateData.orgTenantId);
          console.log(`✓ Switched to org from template`);
        }

        const xeroClient = xeroService.getClient();
        const tenantId = xeroService.getTenantId();

        console.log(`Looking up contact: ${templateData.contact.name}...`);

        let contact;
        try {
          const contactsResponse = await xeroClient.accountingApi.getContacts(tenantId);
          const allContacts = contactsResponse.body.contacts || [];

          contact = allContacts.find((c: any) =>
            c.name?.toLowerCase() === templateData.contact.name.toLowerCase()
          );

          if (!contact) {
            console.error(`❌ Contact not found: ${templateData.contact.name}`);
            console.error(`Available contacts:`);
            allContacts.slice(0, 5).forEach((c: any) => console.error(`  - ${c.name}`));
            process.exit(1);
          }
          console.log(`✓ Found contact: ${contact.name}`);
        } catch (contactError: any) {
          console.error(`❌ Error looking up contact:`, contactError);
          if (contactError.response) {
            console.error('Response:', contactError.response.body);
          }
          throw contactError;
        }

        let invoiceNumber = options.invoiceNumber;
        if (!invoiceNumber) {
          console.log(`\nAuto-generating invoice number...`);

          const invoicePrefix = templateData.invoicePrefix || 'CC-';
          console.log(`  Using prefix: ${invoicePrefix}`);

          const invoicesResponse = await xeroClient.accountingApi.getInvoices(
            tenantId,
            undefined,
            undefined,
            'InvoiceNumber DESC',
            undefined,
            undefined,
            undefined,
            ['SUBMITTED', 'AUTHORISED', 'PAID']
          );

          const sentInvoices = invoicesResponse.body.invoices || [];
          let highestNumber = 0;

          for (const invoice of sentInvoices) {
            const invNumber = invoice.invoiceNumber;
            if (!invNumber) continue;

            if (invNumber.startsWith(invoicePrefix)) {
              const numberPart = invNumber.substring(invoicePrefix.length);
              const number = parseInt(numberPart);

              if (!isNaN(number) && number > highestNumber) {
                highestNumber = number;
              }
            }
          }

          if (highestNumber > 0) {
            invoiceNumber = `${invoicePrefix}${highestNumber + 1}`;
            console.log(`  Highest sent invoice: ${invoicePrefix}${highestNumber}`);
            console.log(`  Next invoice: ${invoiceNumber}`);
          } else {
            invoiceNumber = `${invoicePrefix}1`;
            console.log(`  No previous sent invoices with prefix ${invoicePrefix}`);
            console.log(`  Starting with: ${invoiceNumber}`);
          }
        }

        const invoiceDate = options.date === 'today'
          ? new Date().toISOString().split('T')[0]
          : options.date;

        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + (templateData.invoiceSettings.dueInDays || 7));
        const dueDateStr = dueDate.toISOString().split('T')[0];

        const lineItems = templateData.lineItems.map((item: any) => {
          const quantity = options.quantity ? parseFloat(options.quantity) : item.quantity;
          return {
            description: item.description,
            quantity: quantity,
            unitAmount: item.unitAmount,
            accountCode: item.accountCode,
            taxType: item.taxType,
            itemCode: item.itemCode,
          };
        });

        const invoice = {
          type: templateData.invoiceSettings.type,
          contact: {
            contactID: contact.contactID,
          },
          date: invoiceDate,
          dueDate: dueDateStr,
          lineAmountTypes: templateData.invoiceSettings.lineAmountTypes,
          invoiceNumber: invoiceNumber,
          reference: invoiceNumber,
          status: options.submit ? 'SUBMITTED' as any : 'DRAFT' as any,
          lineItems: lineItems,
        };

        console.log(`\nCreating invoice...`);
        console.log(`  Invoice #: ${invoice.invoiceNumber}`);
        console.log(`  Contact: ${contact.name}`);
        console.log(`  Date: ${invoice.date}`);
        console.log(`  Due: ${invoice.dueDate}`);
        console.log(`  Status: ${invoice.status}`);
        console.log(`  Line Items: ${lineItems.length}`);

        lineItems.forEach((item: any, idx: number) => {
          const total = item.quantity * item.unitAmount;
          console.log(`    ${idx + 1}. ${item.description}: ${item.quantity} × $${item.unitAmount} = $${total}`);
        });

        let response;
        try {
          response = await xeroClient.accountingApi.createInvoices(tenantId, {
            invoices: [invoice],
          });
        } catch (createError: any) {
          console.error('\n❌ Error creating invoice:', createError.message || createError);
          if (createError.response) {
            console.error('Response body:', JSON.stringify(createError.response.body, null, 2));
          }
          throw createError;
        }

        const createdInvoice = response.body.invoices?.[0];

        if (!createdInvoice) {
          console.error('\n❌ Failed to create invoice');
          process.exit(1);
        }

        console.log('\n✅ Invoice created successfully!\n');
        console.log(`Invoice ID: ${createdInvoice.invoiceID}`);
        console.log(`Invoice #: ${createdInvoice.invoiceNumber}`);
        console.log(`Status: ${createdInvoice.status}`);
        console.log(`Total: ${createdInvoice.currencyCode} ${createdInvoice.total}`);
        console.log(`\n🔗 View in Xero:`);

        const orgShortCode = templateData.orgShortCode || '!74DKw';
        console.log(`https://go.xero.com/app/${orgShortCode}/invoicing/edit/${createdInvoice.invoiceID}\n`);

      } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
          console.error('Response:', JSON.stringify(error.response.body, null, 2));
        }
        if (error.stack) {
          console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
      }
    });
}
