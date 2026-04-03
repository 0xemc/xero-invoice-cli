#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { XeroService } from './xero-client.js';
import { AccountingAPIClient } from 'xero-node';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Command: Fetch Invoice(s)
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
        // Fetch specific invoice by ID
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
        // List invoices
        console.log('Fetching invoices from Xero...\n');

        const queryParams: any = {
          page: 1,
        };

        if (options.number) {
          queryParams.invoiceNumbers = [options.number];
        }
        if (options.status) {
          queryParams.statuses = [options.status.toUpperCase()];
        }
        if (options.contact) {
          queryParams.contactIDs = []; // Would need to look up contact ID first
        }

        const response = await xeroClient.accountingApi.getInvoices(
          tenantId,
          undefined, // ifModifiedSince
          undefined, // where
          undefined, // order
          undefined, // IDs
          options.number ? [options.number] : undefined, // invoiceNumbers
          undefined, // contactIDs
          options.status ? [options.status.toUpperCase()] : undefined // statuses
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

// Command: Create Invoice from Template
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

      // Load template
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

      // Get organization for tenant info
      const orgResponse = await xeroClient.accountingApi.getOrganisations(tenantId);
      const org = orgResponse.body.organisations?.[0];

      // Find contact by name
      console.log(`Looking up contact: ${templateData.contact.name}...`);

      let contact;
      try {
        const contactsResponse = await xeroClient.accountingApi.getContacts(tenantId);
        const allContacts = contactsResponse.body.contacts || [];

        // Find contact by name (case-insensitive)
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

      // Auto-generate invoice number if not provided
      let invoiceNumber = options.invoiceNumber;
      if (!invoiceNumber) {
        console.log(`\nAuto-generating invoice number...`);

        // Get the invoice prefix from template (default to CC-)
        const invoicePrefix = templateData.invoicePrefix || 'CC-';
        console.log(`  Using prefix: ${invoicePrefix}`);

        // Get only SUBMITTED, AUTHORISED, and PAID invoices (not drafts)
        const invoicesResponse = await xeroClient.accountingApi.getInvoices(
          tenantId,
          undefined, // ifModifiedSince
          undefined, // where clause
          'InvoiceNumber DESC', // order by invoice number descending
          undefined, // IDs
          undefined, // invoiceNumbers
          undefined, // contactIDs
          ['SUBMITTED', 'AUTHORISED', 'PAID'] // only sent/approved invoices
        );

        const sentInvoices = invoicesResponse.body.invoices || [];

        // Find the highest number for this specific prefix
        let highestNumber = 0;

        for (const invoice of sentInvoices) {
          const invNumber = invoice.invoiceNumber;
          if (!invNumber) continue;

          // Check if this invoice matches our prefix
          if (invNumber.startsWith(invoicePrefix)) {
            // Extract the number after the prefix
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
          // No sent invoices found with this prefix, start with 1
          invoiceNumber = `${invoicePrefix}1`;
          console.log(`  No previous sent invoices with prefix ${invoicePrefix}`);
          console.log(`  Starting with: ${invoiceNumber}`);
        }
      }

      // Calculate dates
      const invoiceDate = options.date === 'today'
        ? new Date().toISOString().split('T')[0]
        : options.date;

      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + (templateData.invoiceSettings.dueInDays || 7));
      const dueDateStr = dueDate.toISOString().split('T')[0];

      // Build line items with overrides
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

      // Create invoice object
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
        status: options.submit ? 'SUBMITTED' : 'DRAFT',
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

      // Create the invoice
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

      // Use organization shortcode from template, fallback to default
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

// Command: List / Switch Organisations
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

// Helper function to display invoice details
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

program.parse();
