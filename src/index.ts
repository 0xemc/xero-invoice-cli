#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import path from 'path';

import { registerAccountsCommand } from './commands/accounts.js';
import { registerItemsCommand } from './commands/items.js';
import { registerInvoiceCommand } from './commands/invoice.js';
import { registerCreateCommand } from './commands/create.js';
import { registerCreateFromCalendarCommand } from './commands/create-from-calendar.js';
import { registerUpdateCommand } from './commands/update.js';
import { registerInfoCommand } from './commands/info.js';
import { registerOrgsCommand } from './commands/orgs.js';
import { registerCalendarCommands } from './commands/calendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('xero-invoice')
  .description('CLI tool for creating Xero invoices from templates')
  .version('0.1.0');

registerAccountsCommand(program);
registerItemsCommand(program);
registerInvoiceCommand(program);
registerCreateCommand(program, __dirname);
registerCreateFromCalendarCommand(program, __dirname);
registerUpdateCommand(program);
registerInfoCommand(program);
registerOrgsCommand(program);
registerCalendarCommands(program);

program.parse();
