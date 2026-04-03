import { Command } from 'commander';
import { listEvents, listCalendars, formatEvent, generateAuthUrl } from '../calendar-client.js';

export function registerCalendarCommands(program: Command) {
  program
    .command('calendar')
    .description('Google Calendar commands')
    .option('-t, --today', 'Show today\'s events')
    .option('-w, --week', 'Show this week\'s events')
    .option('-s, --start <date>', 'Start date (YYYY-MM-DD)')
    .option('-e, --end <date>', 'End date (YYYY-MM-DD)')
    .option('-q, --search <query>', 'Search events by title or description')
    .option('-c, --calendar <name>', 'Calendar name or ID (default: primary)')
    .option('--list-calendars', 'List all available calendars')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        if (options.listCalendars) {
          console.log('Fetching available calendars...\n');
          const calendars = await listCalendars();

          if (options.json) {
            console.log(JSON.stringify(calendars, null, 2));
          } else {
            console.log(`Found ${calendars.length} calendar(s):\n`);
            calendars.forEach((cal, idx) => {
              console.log(`${idx + 1}. ${cal.summary}`);
              console.log(`   ID: ${cal.id}`);
              if (cal.description) {
                console.log(`   Description: ${cal.description}`);
              }
              console.log('');
            });
          }
          return;
        }

        let events: any[] = [];
        const calendarId = options.calendar || 'primary';

        if (options.today) {
          const calMsg = calendarId !== 'primary' ? ` from "${calendarId}"` : '';
          console.log(`Fetching today's calendar events${calMsg}...\n`);
          events = await listEvents(
            new Date().toISOString().split('T')[0],
            new Date(Date.now() + 86400000).toISOString().split('T')[0],
            100,
            undefined,
            calendarId
          );
        } else if (options.week) {
          const calMsg = calendarId !== 'primary' ? ` from "${calendarId}"` : '';
          console.log(`Fetching this week's calendar events${calMsg}...\n`);
          const today = new Date();
          const nextWeek = new Date(today.getTime() + 7 * 86400000);
          events = await listEvents(
            today.toISOString().split('T')[0],
            nextWeek.toISOString().split('T')[0],
            100,
            undefined,
            calendarId
          );
        } else if (options.start && options.end) {
          const searchMsg = options.search ? ` matching "${options.search}"` : '';
          const calMsg = calendarId !== 'primary' ? ` from "${calendarId}"` : '';
          console.log(`Fetching calendar events from ${options.start} to ${options.end}${searchMsg}${calMsg}...\n`);
          events = await listEvents(options.start, options.end, 100, options.search, calendarId);
        } else {
          const calMsg = calendarId !== 'primary' ? ` from "${calendarId}"` : '';
          console.log(`Fetching today's calendar events${calMsg}...\n`);
          const today = new Date().toISOString().split('T')[0];
          const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
          events = await listEvents(today, tomorrow, 100, undefined, calendarId);
        }

        if (events.length === 0) {
          console.log('No events found.');
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(events, null, 2));
        } else {
          console.log(`Found ${events.length} event(s):\n`);
          events.forEach((event, index) => {
            console.log(`${index + 1}. ${formatEvent(event)}`);
            if (event.description) {
              console.log(`   Description: ${event.description}`);
            }
            if (event.location) {
              console.log(`   Location: ${event.location}`);
            }
            console.log('');
          });
        }
      } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('ENOENT') && error.message.includes('gcal-credentials.json')) {
          console.error('\n💡 Please create gcal-credentials.json file with your Google Calendar API credentials.');
          console.error('   Visit: https://developers.google.com/calendar/api/quickstart/nodejs');
        }
        process.exit(1);
      }
    });

  program
    .command('calendar-auth')
    .description('Generate Google Calendar authorization URL for headless/server environments')
    .action(async () => {
      try {
        console.log('\n📋 Google Calendar Authorization URL Generator');
        console.log('─'.repeat(80));
        console.log('\nThis command generates an authorization URL for headless environments.');
        console.log('Use this when you cannot open a browser automatically.\n');

        const authUrl = await generateAuthUrl();

        console.log('Please visit this URL to authorize:\n');
        console.log(authUrl + '\n');
        console.log('After authorizing, you will receive an authorization code.');
        console.log('To complete authentication, run:\n');
        console.log('  GCAL_AUTH_CODE=<your-code> npm run dev calendar --today\n');
        console.log('The code will be exchanged for an access token and saved for future use.');
        console.log('');
      } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('ENOENT') && error.message.includes('gcal-credentials.json')) {
          console.error('\n💡 Please create gcal-credentials.json file with your Google Calendar API credentials.');
          console.error('   Visit: https://developers.google.com/calendar/api/quickstart/nodejs');
        }
        process.exit(1);
      }
    });
}
