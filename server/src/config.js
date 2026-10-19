'use strict';
// Server settings come from environment variables (see server/README.md). Nothing secret lives in the code.
const env = process.env;
const siteUrl = (env.SITE_URL || 'http://localhost:5502').replace(/\/+$/, '');

module.exports = {
    port: +env.PORT || 3001,
    host: env.HOST || '127.0.0.1',                 // only nginx (same machine) talks to the server
    databaseUrl: env.DATABASE_URL || '',            // postgres://user:password@127.0.0.1:5432/techoasis_school
    pgliteDir: env.PGLITE_DIR || '',                // development/testing only: PostgreSQL inside Node (empty = in memory)
    siteUrl,
    // Browsers only send the cookie over HTTPS in production
    cookieSecure: siteUrl.startsWith('https://'),
    // Origins allowed to call the API (same-origin only by default)
    allowedOrigins: (env.ALLOWED_ORIGINS || siteUrl).split(',').map(s => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY !== '0',            // read the visitor address from nginx's X-Real-IP header
    sessionDays: +env.SESSION_DAYS || 30,           // "keep me signed in"
    sessionHours: +env.SESSION_HOURS || 12,         // otherwise
    adminSessionHours: +env.ADMIN_SESSION_HOURS || 8,
    maxBodyBytes: +env.MAX_BODY_MB * 1048576 || 12 * 1048576,   // application documents are up to 1 MB each
    nodeEnv: env.NODE_ENV || 'development'
};
