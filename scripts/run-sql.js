#!/usr/bin/env node
// Executa SQL direto no Postgres do Supabase, sem passar pelo Dashboard.
// Uso: node scripts/run-sql.js caminho/para/arquivo.sql
//      node scripts/run-sql.js --sql="select 1"
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { Client } = require('pg');

const arg = process.argv[2];
if (!arg) {
  console.error('Uso: node scripts/run-sql.js <arquivo.sql>  ou  --sql="SELECT ..."');
  process.exit(1);
}

const sql = arg.startsWith('--sql=') ? arg.slice('--sql='.length) : fs.readFileSync(arg, 'utf8');

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL não configurada no .env. Pegue a connection string em ' +
      'Supabase Dashboard > Project Settings > Database > Connection string (URI) e cole no .env do projeto.'
  );
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const result = await client.query(sql);
    if (Array.isArray(result)) {
      result.forEach((r, i) => {
        console.log(`-- statement ${i + 1} --`);
        printResult(r);
      });
    } else {
      printResult(result);
    }
  } catch (err) {
    console.error('ERRO SQL:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();

function printResult(r) {
  if (r.rows && r.rows.length) {
    console.table(r.rows);
  } else {
    console.log(`OK (${r.command}, ${r.rowCount ?? 0} linha(s) afetada(s))`);
  }
}
