// Applies supabase/migrations/*.sql in order to DATABASE_URL, once each.
// Usage: npm run db:migrate   (reads .env.local)
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy it from Supabase → Project Settings → Database → Connection string (URI).');
  process.exit(1);
}

const dir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz default now())`);
await client.query(`alter table public._migrations enable row level security`);
const done = new Set((await client.query(`select name from public._migrations`)).rows.map((r) => r.name));

for (const file of files) {
  if (done.has(file)) {
    console.log(`skip  ${file}`);
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query(`insert into public._migrations (name) values ($1)`, [file]);
    await client.query('commit');
    console.log(`apply ${file}`);
  } catch (err) {
    await client.query('rollback');
    console.error(`failed ${file}:`, (err as Error).message);
    process.exit(1);
  }
}
await client.end();
