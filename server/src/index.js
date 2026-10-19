'use strict';
const http = require('http');
const cfg = require('./config');
const store = require('./store');
const { Engine } = require('./engine');
const { createHandler } = require('./routes');
const sessions = require('./sessions');

async function createApp(overrides = {}) {
    const config = Object.assign({}, cfg, overrides.cfg || {});
    const db = overrides.db || await store.open(config);
    const engine = await Engine.create({ db, seedDemo: !!overrides.seedDemo, log: overrides.log || console });
    const handler = createHandler({ engine, db, cfg: config, log: overrides.log || console });
    const server = http.createServer(handler);
    server.headersTimeout = 20000; server.requestTimeout = 60000; server.keepAliveTimeout = 5000;
    const purge = setInterval(() => sessions.purgeExpired(db).catch(() => { }), 3600000); purge.unref();
    return { engine, db, server, config, close: async () => { clearInterval(purge); await new Promise(r => server.close(r)); await db.close(); } };
}

if (require.main === module) {
    (async () => {
        if (!cfg.databaseUrl && cfg.nodeEnv === 'production') { console.error('DATABASE_URL is not set. See server/README.md.'); process.exit(1); }
        const app = await createApp({ seedDemo: process.env.SEED_DEMO === '1' });
        await new Promise(r => app.server.listen(cfg.port, cfg.host, r));
        console.log(`Tech Oasis School server on http://${cfg.host}:${cfg.port}  (database: ${app.db.kind}, site: ${cfg.siteUrl})`);
        const stop = async sig => { console.log(sig + ': shutting down'); try { await app.engine.flush(); await app.close(); } finally { process.exit(0); } };
        process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
    })().catch(e => { console.error('Failed to start:', e); process.exit(1); });
}

module.exports = { createApp };
