/**
 * Lightweight cron scheduler using croner
 *
 * Runs the main script on a schedule without requiring root or external cron daemons.
 * Each job execution spawns a fresh process for isolation.
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

import { Cron } from 'croner';

/**
 * Runs the main script as a child process
 * Each execution is isolated with fresh state
 */
function runJob(): void {
  const startTime = new Date().toISOString();
  console.log(`[${startTime}] Starting scheduled job...`);

  const scriptPath = resolve(import.meta.dirname, 'index.js');
  const child = spawn('node', [scriptPath], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('close', (code) => {
    const endTime = new Date().toISOString();
    if (code === 0) {
      console.log(`[${endTime}] Job completed successfully`);
    } else {
      console.error(`[${endTime}] Job exited with code ${code}`);
    }
    console.log('');
  });

  child.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Failed to start job:`, error);
  });
}

function main(): void {
  const schedule = process.env['CRON_SCHEDULE'];

  if (!schedule) {
    console.error('Error: CRON_SCHEDULE environment variable is required');
    process.exit(1);
  }

  const timezone = process.env['TZ'] ?? 'Europe/Rome';

  console.log('=== GO Automation Cron Scheduler ===');
  console.log(`Schedule: ${schedule}`);
  console.log(`Timezone: ${timezone}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');

  const job = new Cron(schedule, { timezone }, runJob);

  const nextRun = job.nextRun();
  if (nextRun) {
    console.log(`Next run: ${nextRun.toISOString()}`);
  }
  console.log('Waiting for scheduled runs...');
  console.log('-----------------------------------');
  console.log('');

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('\nReceived shutdown signal, stopping scheduler...');
    job.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
