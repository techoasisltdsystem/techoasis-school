'use strict';
// Sign-in sessions. The browser holds a random token in an HttpOnly cookie (scripts on the page cannot read it).
// The database stores only the SHA-256 of the token, so a leaked database cannot be used to sign in.
const crypto = require('crypto');

const hash = token => crypto.createHash('sha256').update(String(token)).digest('hex');

async function create(db, { userId, role, ip, seconds }) {
    const token = crypto.randomBytes(32).toString('base64url');
    await db.query('insert into sessions (token_hash, user_id, role, expires_at, ip) values ($1, $2, $3, now() + make_interval(secs => $4::int), $5)',
        [hash(token), userId, role, Math.round(seconds), String(ip || '').slice(0, 64)]);
    return token;
}
async function lookup(db, token) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const rows = await db.query('select user_id, role from sessions where token_hash = $1 and expires_at > now()', [hash(token)]);
    return rows.length ? { userId: rows[0].user_id, role: rows[0].role } : null;
}
const destroy = (db, token) => db.query('delete from sessions where token_hash = $1', [hash(token)]);
const destroyForUser = (db, userId, exceptToken) =>
    db.query('delete from sessions where user_id = $1 and ($2::text is null or token_hash <> $2)', [userId, exceptToken ? hash(exceptToken) : null]);
const purgeExpired = db => db.query('delete from sessions where expires_at <= now()');

module.exports = { create, lookup, destroy, destroyForUser, purgeExpired };
