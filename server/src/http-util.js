'use strict';
// Small HTTP helpers (no framework: fewer moving parts and fewer things to keep patched).

class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const declared = +req.headers['content-length'] || 0;
        if (declared > limit) { req.resume(); return reject(new HttpError(413, 'TOO_LARGE', 'That request is too large.')); }
        const chunks = []; let size = 0;
        req.on('data', c => { size += c.length; if (size > limit) { reject(new HttpError(413, 'TOO_LARGE', 'That request is too large.')); req.destroy(); } else chunks.push(c); });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

async function readJson(req, limit) {
    const text = await readBody(req, limit);
    if (!text) return {};
    try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : {}; }
    catch (e) { throw new HttpError(400, 'BAD_JSON', 'The request could not be read.'); }
}

function send(res, status, payload, headers) {
    const body = JSON.stringify(payload);
    res.writeHead(status, Object.assign({
        'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
    }, headers || {}));
    res.end(body);
}

function parseCookies(header) {
    const out = {};
    String(header || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
    return out;
}
function cookie(name, value, { secure, maxAgeSeconds, clear } = {}) {
    const parts = [`${name}=${clear ? '' : encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
    if (secure) parts.push('Secure');
    if (clear) parts.push('Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    else if (maxAgeSeconds) parts.push('Max-Age=' + Math.floor(maxAgeSeconds));
    return parts.join('; ');
}

// Sliding-window rate limits kept in memory (per process). Used for sign-in, applications and other abuse-prone calls.
class Limiter {
    constructor() { this.hits = new Map(); setInterval(() => this.sweep(), 60000).unref(); }
    count(key, windowMs) {
        const now = Date.now(), arr = (this.hits.get(key) || []).filter(t => now - t < windowMs);
        this.hits.set(key, arr); return arr.length;
    }
    blocked(key, max, windowMs) { return this.count(key, windowMs) >= max; }
    hit(key, windowMs) { const arr = this.hits.get(key) || []; arr.push(Date.now()); this.hits.set(key, arr); void windowMs; }
    sweep() { const now = Date.now(); for (const [k, v] of this.hits) { const f = v.filter(t => now - t < 3600000); if (f.length) this.hits.set(k, f); else this.hits.delete(k); } }
    reset(key) { this.hits.delete(key); }
}

module.exports = { HttpError, readJson, send, parseCookies, cookie, Limiter };
