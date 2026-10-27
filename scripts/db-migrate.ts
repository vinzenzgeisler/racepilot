import { migrate } from '@racepilot/adapter-postgres';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
await migrate(url);
