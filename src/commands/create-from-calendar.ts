import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { XeroService } from '../xero-client.js';
import { listEvents } from '../calendar-client.js';

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const SCOPES = (process.env.SCOPES || 'openid profile email accounting.transactions accounting.settings offline_access').split(' ');

interface LineItemPattern {
  id: string;
  pattern: string;
  description: string;
  itemCode: string;
  accountCode: string;
  unitAmount?: number;
  taxType: string;
}

interface CalendarLineItem {
  date: string;
  patternId: string;
  description: string;
  itemCode: string;
  accountCode: string;
  unitAmount?: number;
  taxType: string;
  eventTitle: string;
}

function matchEventToPattern(eventTitle: string, patterns: LineItemPattern[]): LineItemPattern | null {
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.pattern, 'i');
    if (regex.test(eventTitle)) {
      return pattern;
    }
  }
  return null;
}

function formatDate(dateStr: string): string {
  // Extract the local date directly from the ISO string to avoid UTC offset shifting
  const localDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = localDate.split('-');
  return `${day}/${month}/${year}`;
}

export function registerCreateFromCalendarCommand(program: Command, __dirname: string) {
  program
    .command('create-from-calendar <template>')
    .description('Create invoice from calendar events using pattern matching')
    .option('-c, --calendar <name>', 'Calendar name or ID', 'primary')
    .option('-s, --start <date>', 'Start date (YYYY-MM-DD)', 'today')
    .option('-e, --end <date>', 'End date (YYYY-MM-DD)', 'today')
    .option('-q, --query <search>', 'Search query for events (e.g., "[chess]")')
    .option('-n, --invoice-number <number>', 'Invoice number (auto-increments if not provided)')
    .option('-d, --date <date>', 'Invoice date (YYYY-MM-DD or "today")', 'today')
    .option('--draft', 'Create as draft (default)', true)
    .option('--submit', 'Submit invoice immediately')
    .option('--dry-run', 'Show what would be created without creating the invoice')
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

        if (!templateData.lineItemPatterns || templateData.lineItemPatterns.length === 0) {
          console.error('❌ Template does not have lineItemPatterns defined');
          console.error('💡 Add a "lineItemPatterns" array to your template with pattern matching rules');
          process.exit(1);
        }

        console.log(`Found ${templateData.lineItemPatterns.length} line item patterns in template`);

        const startDate = options.start === 'today'
          ? new Date().toISOString().split('T')[0]
          : options.start;
        const endDate = options.end === 'today'
          ? new Date().toISOString().split('T')[0]
          : options.end;

        console.log(`\nFetching events from calendar: ${options.calendar}`);
        console.log(`Date range: ${startDate} to ${endDate}`);
        if (options.query) {
          console.log(`Search query: ${options.query}`);
        }

        const events = await listEvents(
          startDate,
          endDate,
          100,
          options.query,
          options.calendar
        );

        console.log(`Found ${events.length} calendar events\n`);

        if (events.length === 0) {
          console.error('❌ No calendar events found for the specified criteria');
          process.exit(1);
        }

        const matchedItems: CalendarLineItem[] = [];
        const unmatchedEvents: any[] = [];

        for (const event of events) {
          const eventTitle = event.summary || '';
          const eventDate = event.start.dateTime || event.start.date;

          const pattern = matchEventToPattern(eventTitle, templateData.lineItemPatterns);

          if (pattern) {
            matchedItems.push({
              date: formatDate(eventDate),
              patternId: pattern.id,
              description: `${formatDate(eventDate)} - ${pattern.description}`,
              itemCode: pattern.itemCode,
              accountCode: pattern.accountCode,
              unitAmount: pattern.unitAmount,
              taxType: pattern.taxType,
              eventTitle: eventTitle,
            });
          } else {
            unmatchedEvents.push({
              title: eventTitle,
              date: formatDate(eventDate),
            });
          }
        }

        console.log(`✅ Matched ${matchedItems.length} events to patterns`);
        if (unmatchedEvents.length > 0) {
          console.log(`⚠️  ${unmatchedEvents.length} events did not match any pattern:`);
          unmatchedEvents.forEach(e => {
            console.log(`   - ${e.date}: ${e.title}`);
          });
          console.log('');
        }

        if (matchedItems.length === 0) {
          console.error('❌ No events matched any line item patterns');
          process.exit(1);
        }

        console.log('\n📦 Line items to create:');
        matchedItems.forEach((item, idx) => {
          const priceDisplay = item.unitAmount ? `$${item.unitAmount}` : '(uses item default)';
          console.log(`${idx + 1}. ${item.description} - ${priceDisplay}`);
          console.log(`   Pattern ID: ${item.patternId}`);
          console.log(`   Event: "${item.eventTitle}"`);
        });

        const itemsWithPrices = matchedItems.filter(item => item.unitAmount);
        if (itemsWithPrices.length > 0) {
          const total = itemsWithPrices.reduce((sum, item) => sum + (item.unitAmount || 0), 0);
          console.log(`\n💰 Estimated Total (items with explicit prices): $${total}`);
          if (itemsWithPrices.length < matchedItems.length) {
            console.log(`   Note: ${matchedItems.length - itemsWithPrices.length} item(s) use default price from Xero item`);
          }
        } else {
          console.log(`\n💰 All items use default prices from Xero items`);
        }

        if (options.dryRun) {
          console.log('\n🔍 Dry run mode - no invoice created\n');
          return;
        }

        await xeroService.ensureValidToken();

        if (templateData.orgTenantId && templateData.orgTenantId !== xeroService.getTenantId()) {
          xeroService.setTenantId(templateData.orgTenantId);
          console.log(`✓ Switched to org from template`);
        }

        const xeroClient = xeroService.getClient();
        const tenantId = xeroService.getTenantId();

        console.log(`\nLooking up contact: ${templateData.contact.name}...`);

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

        const lineItems = matchedItems.map(item => {
          const lineItem: any = {
            description: item.description,
            quantity: 1,
            accountCode: item.accountCode,
            taxType: item.taxType,
            itemCode: item.itemCode,
          };

          if (item.unitAmount !== undefined) {
            lineItem.unitAmount = item.unitAmount;
          }

          return lineItem;
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
