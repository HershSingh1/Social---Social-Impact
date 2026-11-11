// Fast SQL/pgTAP check without Docker. Hosted Auth and Realtime still need integration checks.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgtap } from '@electric-sql/pglite-pgtap';
const db = new PGlite({ extensions: { pgtap } });
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema extensions;
    create table auth.users (id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema public, auth, extensions to anon, authenticated;
    create publication supabase_realtime;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  for (const m of ['20261110000100_core.sql', '20261110000200_profiles.sql'])
    await db.exec(await readFile(new URL(`../migrations/${m}`, import.meta.url), 'utf8'));
  const lines = [];
  for (const t of ['core_rls.test.sql', 'profiles.test.sql']) {
    const results = await db.exec(await readFile(new URL(`./${t}`, import.meta.url), 'utf8'));
    lines.push(...collect(results));
  }
  console.log(lines.join('\n'));
  if (lines.some(line => /^not ok /m.test(line)) || lines.filter(l => /^1\.\./m.test(l)).length < 2) process.exitCode = 1;
} finally { await db.close(); }
function collect(results) {
  return results.flatMap(result => result.rows.flatMap(row => Object.values(row)))
    .filter(value => typeof value === 'string' && /^(ok |not ok |1\.\.|#)/m.test(value));
}
