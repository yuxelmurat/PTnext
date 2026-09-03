import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scheduledTaskDecision } from '../lib/update-schedule.mjs';

const dashboard = JSON.parse(await readFile(resolve(import.meta.dirname, '../public/data/dashboard.json'), 'utf8'));
console.log(JSON.stringify(scheduledTaskDecision(dashboard.teamFixtures)));
