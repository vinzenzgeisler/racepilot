import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './packages/adapter-postgres/src/index.ts',
  out: './packages/adapter-postgres/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost/racepilot',
  },
});
