'use strict';
const sessions = require('./sessions');
const { snapshot, certificateByCode } = require('./snapshots');
const { applyOps, SyncError } = require('./sync');
const { HttpError, readJson, send, parseCookies, cookie, Limiter } = require('./http-util');
const { recordFor, getAt, decode } = require('./blobs');

const COOKIE = 'tos_session';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const MIN = 60000, HOUR = 3600000;
const INTERNAL_ERROR = /(cannot read|cannot set|cannot destructure|is not a function|is not defined|is not iterable|of undefined|of null|reading '|unexpected token|\bundefined\b|\bnull\b|maximum call stack)/i;

// Error codes used by the site's logic -> HTTP status
const STATUS = { UNAUTHENTICATED: 401, AUTH: 401, FORBIDDEN: 403, NO_ACCESS: 403, SUSPENDED: 403, NOT_FOUND: 404, DUPLICATE: 409, INVALID: 400, TOO_LARGE: 413, RATE_LIMIT: 429 };
const statusFor = code => STATUS[code] || (String(code || '').startsWith('ACCOUNT_') ? 403 : 400);

function createHandler({ engine, db, cfg, log = console }) {
    const limiter = new Limiter();
    const TOS = engine.TOS;

    // ---------- helpers ----------
    const clientIp = req => {
        const real = req.headers['x-real-ip'], remote = req.socket.remoteAddress || '';
        const fromProxy = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(remote);
        return (cfg.trustProxy && fromProxy && real ? String(real) : remote).slice(0, 64);
    };
    const fail = (code, message) => { throw new HttpError(statusFor(code), code, message); };
    const tooMany = () => fail('RATE_LIMIT', 'Too many attempts. Please wait a few minutes and try again.');

    async function identify(ctx) {
        const token = parseCookies(ctx.req.headers.cookie)[COOKIE];
        ctx.token = token || null;
        const s = token ? await sessions.lookup(db, token) : null;
        ctx.session = null; ctx.me = null; ctx.problem = 'none'; ctx.rawUserId = null;
        if (!s) return;
        ctx.rawUserId = s.userId;   // the site's own logic decides what an inactive account is told (suspended, banned ...)
        const r = engine.withUser(s.userId, s.role, () => ({ me: TOS.auth.current(), problem: TOS.auth.sessionProblem() }));
        ctx.problem = r.problem || 'none';
        if (r.me) { ctx.session = { userId: s.userId, role: r.me.role }; ctx.me = JSON.parse(JSON.stringify(r.me)); }
        else if (r.problem === 'deleted') { await sessions.destroy(db, token); ctx.clearCookie = true; }
    }
    const requireAdmin = ctx => { if (!ctx.me || ctx.me.role !== 'admin') fail('FORBIDDEN', 'Administrator access is required.'); };

    async function startSession(ctx, userId, role, remember) {
        const seconds = role === 'admin' ? cfg.adminSessionHours * 3600 : remember === false ? cfg.sessionHours * 3600 : cfg.sessionDays * 86400;
        const token = await sessions.create(db, { userId, role, ip: ctx.ip, seconds });
        ctx.setCookie = cookie(COOKIE, token, { secure: cfg.cookieSecure, maxAgeSeconds: role === 'admin' || remember === false ? 0 : seconds });
        ctx.token = token;
    }
    // Runs a function of the site's logic as a user and returns its (JSON-safe) result. Errors keep their code.
    async function run(userId, fnPath, args) {
        try {
            const data = await engine.callAs(userId, null, fnPath, args);
            return data === undefined ? null : JSON.parse(JSON.stringify(data));
        } catch (e) {
            const code = e && e.code && e.code !== 'ERROR' ? e.code : 'ERROR';
            if (code === 'ERROR') {
                log.error('[logic error]', fnPath, e && e.message);
                // The site's own rules reject with plain sentences ("You are not allowed to message this recipient."): show those.
                // Anything that looks like a program fault stays hidden behind a generic message.
                const internal = !e || !e.message || INTERNAL_ERROR.test(e.message);
                throw internal ? new HttpError(500, 'ERROR', 'Something went wrong. Please try again.') : new HttpError(400, 'ERROR', e.message);
            }
            throw new HttpError(statusFor(code), code, e.message);
        }
    }
    const done = async (ctx, payload, status) => { await engine.flush(); return { status: status || 200, body: Object.assign({}, payload, { rev: engine.rev }) }; };

    // ---------- routes ----------
    const R = {};

    R['GET /api/health'] = async () => ({ body: { ok: true, rev: engine.rev } });

    R['GET /api/bootstrap'] = async ctx => ({
        body: { me: ctx.me, problem: ctx.problem, rev: engine.rev, state: snapshot(engine, ctx.session), serverTime: new Date().toISOString() }
    });
    // Cheap check the browsers poll: has anything changed, and am I still signed in?
    R['GET /api/rev'] = async ctx => ({ body: { rev: engine.rev, uid: ctx.me ? ctx.me.id : null, problem: ctx.problem } });

    R['POST /api/auth/login'] = async ctx => {
        const b = ctx.body, email = String(b.email || '').trim().toLowerCase().slice(0, 254), pw = String(b.password || '').slice(0, 128);
        const k1 = `login:${ctx.ip}:${email}`, k2 = `login-ip:${ctx.ip}`;
        if (limiter.blocked(k1, 8, 10 * MIN) || limiter.blocked(k2, 40, 10 * MIN)) tooMany();
        const role = b.role === 'staff' ? 'staff' : b.role === 'student' ? 'student' : null;
        const { result, userId } = engine.captureLogin('TOS.auth.login', [email, pw, role, b.remember !== false]);
        if (!result || result.error || !userId) { limiter.hit(k1); limiter.hit(k2); return done(ctx, { error: (result && result.error) || 'Incorrect email, student ID or password.', status: result && result.status }, 200); }
        limiter.reset(k1);
        await startSession(ctx, userId, result.user.role, b.remember !== false);
        return done(ctx, { user: JSON.parse(JSON.stringify(result.user)) });
    };

    R['POST /api/auth/staff-login'] = async ctx => {
        const b = ctx.body, email = String(b.email || '').trim().toLowerCase().slice(0, 254), pw = String(b.password || '').slice(0, 128);
        const k1 = `login:${ctx.ip}:${email}`, k2 = `login-ip:${ctx.ip}`;
        if (limiter.blocked(k1, 8, 10 * MIN) || limiter.blocked(k2, 40, 10 * MIN)) tooMany();
        const { result, userId } = engine.captureLogin('TOS.staff.staffLogin', [email, pw, b.remember !== false]);
        if (!result || result.error || !userId) { limiter.hit(k1); limiter.hit(k2); return done(ctx, { error: (result && result.error) || 'Incorrect email or password.', status: result && result.status, application: !!(result && result.application) }, 200); }
        limiter.reset(k1);
        await startSession(ctx, userId, 'staff', b.remember !== false);
        return done(ctx, { user: JSON.parse(JSON.stringify(result.user)), mustChangePassword: !!result.mustChangePassword });
    };

    R['POST /api/auth/admin-login'] = async ctx => {
        const id = String(ctx.body.id || '').trim().toLowerCase().slice(0, 254), pass = String(ctx.body.pass || '').slice(0, 128);
        const k = `admin:${ctx.ip}`;
        if (limiter.blocked(k, 6, 15 * MIN)) tooMany();
        const admins = engine.raw().tables.users.filter(u => u.role === 'admin' && (u.status || 'active') === 'active');
        const u = admins.find(x => x.email === id) || (id === 'admin' && admins.length === 1 ? admins[0] : null);
        const ok = !!u && TOS.crypto.verifyPassword(pass, u.passwordHash);
        if (!ok) { limiter.hit(k); return { body: { ok: false } }; }
        limiter.reset(k);
        u.lastLoginAt = new Date().toISOString();
        await startSession(ctx, u.id, 'admin', false);
        return done(ctx, { ok: true, user: { id: u.id, name: u.name, email: u.email, role: 'admin' } });
    };

    R['POST /api/auth/register'] = async ctx => {
        const b = ctx.body, email = String(b.email || '').trim().toLowerCase(), name = String(b.name || '').trim();
        if (limiter.blocked(`reg:${ctx.ip}`, 8, HOUR)) tooMany();
        if (!EMAIL_RE.test(email) || email.length > 254) return { body: { error: 'Enter a valid email address.' } };
        if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128) return { body: { error: 'Use at least 8 characters for your password.' } };
        if (name.length > 100) return { body: { error: 'That name is too long.' } };
        limiter.hit(`reg:${ctx.ip}`);
        const { result, userId } = engine.captureLogin('TOS.auth.register', [{ name, email, password: b.password }]);
        if (!result || result.error || !userId) return done(ctx, { error: (result && result.error) || 'Could not create the account.' });
        await startSession(ctx, userId, 'student', true);
        return done(ctx, { user: JSON.parse(JSON.stringify(result.user)) });
    };

    R['POST /api/auth/logout'] = async ctx => {
        if (ctx.token) await sessions.destroy(db, ctx.token);
        ctx.clearCookie = true;
        return { body: { ok: true } };
    };

    // The administrator's own password ("passcode")
    R['POST /api/auth/admin-password'] = async ctx => {
        requireAdmin(ctx);
        const next = String(ctx.body.password || '');
        if (next.length < 8 || next.length > 128) fail('INVALID', 'Use at least 8 characters.');
        const u = engine.raw().tables.users.find(x => x.id === ctx.me.id);
        u.passwordHash = TOS.crypto.hashPassword(next); u.passwordChangedAt = new Date().toISOString(); u.updatedAt = u.passwordChangedAt;
        await sessions.destroyForUser(db, u.id, ctx.token);
        return done(ctx, { ok: true });
    };

    // The student and staff portals: the site's own API functions, run on the server as the signed-in user.
    R['POST /api/rpc/:ns/:fn'] = async ctx => {
        const { ns, fn } = ctx.params;
        if (limiter.blocked(`rpc:${ctx.ip}`, 900, MIN)) tooMany();
        limiter.hit(`rpc:${ctx.ip}`);
        const args = Array.isArray(ctx.body.args) ? ctx.body.args : [];
        if (args.length > 10 || !/^[A-Za-z]{1,40}$/.test(fn)) fail('INVALID', 'Unknown request.');
        if (ns === 'student' || ns === 'staff') {
            const api = ns === 'student' ? TOS.api : TOS.staffApi;
            if (fn === 'ApiError' || !Object.prototype.hasOwnProperty.call(api, fn) || typeof api[fn] !== 'function') fail('NOT_FOUND', 'Unknown request.');
            const data = await run(ctx.rawUserId, `TOS.${ns === 'student' ? 'api' : 'staffApi'}.${fn}`, args);
            if (fn === 'changePassword' && ctx.session && ctx.token) await sessions.destroyForUser(db, ctx.session.userId, ctx.token);   // other devices are signed out
            return done(ctx, { data });
        }
        if (ns === 'public') {
            if (!Object.prototype.hasOwnProperty.call(TOS.serverPublic, fn) || typeof TOS.serverPublic[fn] !== 'function') fail('NOT_FOUND', 'Unknown request.');
            const email = String(args[0] && typeof args[0] === 'object' ? args[0].email : args[0] || '').toLowerCase().slice(0, 254);
            if (fn === 'apply' && limiter.blocked(`apply:${ctx.ip}`, 4, HOUR)) tooMany();
            if (fn === 'applyBlock') { if (limiter.blocked(`block:${ctx.ip}`, 30, 10 * MIN)) tooMany(); limiter.hit(`block:${ctx.ip}`); }   // so it cannot be used to find out which emails have accounts
            if (['status', 'withdraw', 'reply'].includes(fn) && limiter.blocked(`appauth:${ctx.ip}:${email}`, 10, 10 * MIN)) tooMany();
            if ((fn === 'forgot' || fn === 'studentForgot') && limiter.blocked(`forgot:${ctx.ip}`, 6, HOUR)) tooMany();
            if (['reset', 'verifyEmail'].includes(fn) && limiter.blocked(`token:${ctx.ip}`, 20, 10 * MIN)) tooMany();
            try {
                const data = await run(null, `TOS.serverPublic.${fn}`, args);
                if (fn === 'apply') limiter.hit(`apply:${ctx.ip}`);
                if ((fn === 'forgot' || fn === 'studentForgot')) limiter.hit(`forgot:${ctx.ip}`);
                if (fn === 'reset' && data && data.userId) { await sessions.destroyForUser(db, data.userId); delete data.userId; }
                return done(ctx, { data });
            } catch (e) {
                if (['status', 'withdraw', 'reply'].includes(fn)) limiter.hit(`appauth:${ctx.ip}:${email}`);
                if (['reset', 'verifyEmail'].includes(fn)) limiter.hit(`token:${ctx.ip}`);
                throw e;
            }
        }
        fail('NOT_FOUND', 'Unknown request.');
    };

    // Administrator edits (the admin screens work on their own copy and send back the changes)
    R['POST /api/sync'] = async ctx => {
        requireAdmin(ctx);
        let applied;
        try { applied = applyOps(engine, ctx.body.ops); }
        catch (e) {
            if (e instanceof SyncError) { const err = new HttpError(e.status, e.status === 409 ? 'CONFLICT' : 'INVALID', e.message); throw err; }
            log.error('[sync] unexpected:', e); await engine.reloadFromDb().catch(() => { });
            throw new HttpError(500, 'ERROR', 'The change could not be saved.');
        }
        try { return await done(ctx, { ok: true, applied }); }
        catch (e) { log.error('[sync] save failed:', e.message); await engine.reloadFromDb().catch(() => { }); throw new HttpError(500, 'ERROR', 'The change could not be saved.'); }
    };

    // A large uploaded file, on request (see blobs.js for who may open what)
    R['GET /api/blob/:table/:id/:path'] = async ctx => {
        if (limiter.blocked(`blob:${ctx.ip}`, 600, MIN)) tooMany();
        limiter.hit(`blob:${ctx.ip}`);
        const { table, id, path } = ctx.params;
        const row = recordFor(engine, ctx.session, table, id);
        const value = row ? getAt(row, path) : null;
        const file = typeof value === 'string' ? decode(value) : null;
        if (!file) fail('NOT_FOUND', 'File not found.');
        return { raw: {
            status: 200, buffer: file.buffer,
            headers: {
                'Content-Type': file.inline ? file.mime : 'application/octet-stream', 'Content-Length': file.buffer.length,
                'Content-Disposition': file.inline ? 'inline' : 'attachment', 'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'private, max-age=300'
            }
        } };
    };

    // Certificate verification (public, by code)
    R['GET /api/certificate/:code'] = async ctx => {
        if (limiter.blocked(`cert:${ctx.ip}`, 60, MIN)) tooMany();
        limiter.hit(`cert:${ctx.ip}`);
        const c = certificateByCode(engine, ctx.params.code);
        if (!c) fail('NOT_FOUND', 'No certificate with that ID.');
        delete c.userId;
        return { body: { certificate: c } };
    };

    // ---------- dispatcher ----------
    const exact = new Map(), patterns = [];
    for (const key of Object.keys(R)) {
        const [method, p] = key.split(' ');
        if (p.includes(':')) patterns.push({ method, parts: p.split('/'), fn: R[key] }); else exact.set(key, R[key]);
    }
    function match(method, pathname) {
        const direct = exact.get(method + ' ' + pathname); if (direct) return { fn: direct, params: {} };
        const segs = pathname.split('/');
        for (const p of patterns) {
            if (p.method !== method || p.parts.length !== segs.length) continue;
            const params = {}; let ok = true;
            for (let i = 0; i < segs.length && ok; i++) { if (p.parts[i].startsWith(':')) params[p.parts[i].slice(1)] = decodeURIComponent(segs[i]); else if (p.parts[i] !== segs[i]) ok = false; }
            if (ok) return { fn: p.fn, params };
        }
        return null;
    }

    return async function handle(req, res) {
        const t0 = Date.now(); let status = 500;
        const finish = () => { if (cfg.nodeEnv !== 'test') log.log(`${req.method} ${String(req.url).split('?')[0].slice(0, 80)} ${status} ${Date.now() - t0}ms`); };
        const ctx = { req, res, ip: clientIp(req), body: {}, params: {}, setCookie: null, clearCookie: false };
        try {
            const url = new URL(req.url, 'http://localhost');
            const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
            const m = match(req.method, pathname);
            if (!m) throw new HttpError(req.method === 'GET' || req.method === 'POST' ? 404 : 405, 'NOT_FOUND', 'Not found.');
            ctx.params = m.params; ctx.query = Object.fromEntries(url.searchParams);
            if (req.method === 'POST') {
                // CSRF: another website cannot send this header or a JSON body from a browser without our permission
                const origin = req.headers.origin;
                if (origin && !cfg.allowedOrigins.includes(origin) && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'FORBIDDEN', 'Request not allowed.');
                if (req.headers['x-tos'] !== '1' || !String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(400, 'BAD_REQUEST', 'Request not allowed.');
                ctx.body = await readJson(req, cfg.maxBodyBytes);
            }
            await identify(ctx);
            const out = await m.fn(ctx);
            if (out.raw) { status = out.raw.status; res.writeHead(status, out.raw.headers); res.end(out.raw.buffer); return finish(); }
            status = out.status || 200;
            const headers = {};
            if (ctx.setCookie) headers['Set-Cookie'] = ctx.setCookie;
            else if (ctx.clearCookie) headers['Set-Cookie'] = cookie(COOKIE, '', { secure: cfg.cookieSecure, clear: true });
            send(res, status, out.body, headers);
        } catch (e) {
            if (e instanceof HttpError) { status = e.status; send(res, status, { error: { code: e.code, message: e.message } }); }
            else { status = 500; log.error('[request error]', req.method, req.url, e); send(res, 500, { error: { code: 'ERROR', message: 'Something went wrong. Please try again.' } }); }
        }
        finish();
    };
}

module.exports = { createHandler };
