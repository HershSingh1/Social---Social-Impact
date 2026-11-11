// Fast SQL/pgTAP check without Docker. Hosted Auth and Realtime still need integration checks.
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgtap } from '@electric-sql/pglite-pgtap';
const db = new PGlite({ extensions: { pgtap } });
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema extensions;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema public, auth, extensions to anon, authenticated;
    create publication supabase_realtime;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  const migrations = new URL('../migrations/', import.meta.url);
  for (const f of (await readdir(migrations)).filter(f => f.endsWith('.sql')).sort())
    await db.exec(await readFile(new URL(f, migrations), 'utf8'));
  const lines = [];
  for (const f of (await readdir(new URL('./', import.meta.url))).filter(f => f.endsWith('.test.sql')).sort()) {
    const results = await db.exec(await readFile(new URL(f, import.meta.url), 'utf8'));
    lines.push(...results.flatMap(result => result.rows.flatMap(row => Object.values(row)))
      .filter(value => typeof value === 'string' && /^(ok |not ok |1\.\.|#)/m.test(value)));
  }
  console.log(lines.join('\n'));
  if (!lines.some(line => /^1\.\./m.test(line)) || lines.some(line => /^not ok /m.test(line))) process.exitCode = 1;
} finally { await db.close(); }
