'use strict';
// PostgreSQL storage. Every kind of record (users, courses, enrollments ...) is a real table with one row per record:
//   id text primary key, data jsonb (the record), seq (insertion order), updated_at
// The site's own rules (relations, cascades, grading, permissions) run in the engine; PostgreSQL makes the data durable,
// backed-up and queryable. Tables can be normalised into typed columns later without changing the site.

async function open(cfg) {
    if (cfg.databaseUrl) {
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: cfg.databaseUrl, max: 6, idleTimeoutMillis: 30000 });
        pool.on('error', e => console.error('[db] idle client error:', e.message));
        const q = (sql, p) => pool.query(sql, p).then(r => r.rows);
        return {
            kind: 'postgres', query: q,
            async tx(fn) {
                const c = await pool.connect();
                try { await c.query('begin'); const r = await fn((sql, p) => c.query(sql, p).then(x => x.rows)); await c.query('commit'); return r; }
                catch (e) { await c.query('rollback').catch(() => { }); throw e; }
                finally { c.release(); }
            },
            close: () => pool.end()
        };
    }
    const { PGlite } = require('@electric-sql/pglite');
    const db = cfg.pgliteDir ? new PGlite(cfg.pgliteDir) : new PGlite();
    await db.waitReady;
    return {
        kind: 'pglite', query: (sql, p) => db.query(sql, p).then(r => r.rows),
        tx: fn => db.transaction(t => fn((sql, p) => t.query(sql, p).then(r => r.rows))),
        close: () => db.close()
    };
}

const q = name => '"' + name.replace(/"/g, '""') + '"';

async function ensureSchema(store, tables) {
    await store.tx(async query => {
        for (const t of tables) {
            await query(`create table if not exists ${q(t)} (id text primary key, data jsonb not null, seq bigserial, updated_at timestamptz not null default now())`);
            await query(`create index if not exists ${q(t + '_seq')} on ${q(t)} (seq)`);
        }
        await query(`create table if not exists settings (grp text primary key, data jsonb not null, updated_at timestamptz not null default now())`);
        await query(`create table if not exists meta (k text primary key, v jsonb not null)`);
        await query(`create table if not exists sessions (
            token_hash text primary key, user_id text not null, role text not null,
            expires_at timestamptz not null, created_at timestamptz not null default now(), ip text)`);
        await query(`create index if not exists sessions_user on sessions (user_id)`);
        await query(`create index if not exists sessions_expiry on sessions (expires_at)`);
    });
}

// Whole school state, in insertion order. Returns null when the database has no data yet.
async function loadState(store, tables) {
    const out = { tables: {}, settings: {}, meta: {} };
    let any = false;
    for (const t of tables) {
        const rows = await store.query(`select data from ${q(t)} order by seq`);
        out.tables[t] = rows.map(r => r.data);
        if (rows.length) any = true;
    }
    for (const r of await store.query('select grp, data from settings')) { out.settings[r.grp] = r.data; any = true; }
    for (const r of await store.query('select k, v from meta')) out.meta[r.k] = r.v;
    return any || Object.keys(out.meta).length ? out : null;
}

// ops: { t:'put', table, id, data } | { t:'del', table, id } | { t:'setting', grp, data } | { t:'meta', k, v }. One transaction.
async function writeOps(store, ops) {
    if (!ops.length) return;
    await store.tx(async query => {
        for (const o of ops) {
            if (o.t === 'put') await query(`insert into ${q(o.table)} (id, data) values ($1, $2::jsonb) on conflict (id) do update set data = excluded.data, updated_at = now()`, [o.id, o.json || JSON.stringify(o.data)]);
            else if (o.t === 'del') await query(`delete from ${q(o.table)} where id = $1`, [o.id]);
            else if (o.t === 'setting') await query(`insert into settings (grp, data) values ($1, $2::jsonb) on conflict (grp) do update set data = excluded.data, updated_at = now()`, [o.grp, o.json || JSON.stringify(o.data)]);
            else if (o.t === 'meta') await query(`insert into meta (k, v) values ($1, $2::jsonb) on conflict (k) do update set v = excluded.v`, [o.k, JSON.stringify(o.v)]);
        }
    });
}

module.exports = { open, ensureSchema, loadState, writeOps };
