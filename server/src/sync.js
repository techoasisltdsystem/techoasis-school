'use strict';
// The administrator's edits. The admin screens work on their own copy of the data (the same screens as before) and send
// back what changed. Admin-only, and every request is still validated here before anything is applied.
//
// Op shapes:  { op:'put',  table, id, row }                  new record (or full replacement)
//             { op:'patch', table, id, set:{..}, unset:[..] } changed fields of an existing record
//             { op:'del',  table, id }
//             { op:'setting', group, data }                   a whole settings group
//
// Things the browser can never do through here: choose password hashes, create administrators, delete the last
// administrator, or touch the server's internal settings.

const ID_RE = /^[A-Za-z0-9_-]{3,80}$/;
const GROUPS = new Set(['school', 'courses', 'certificates', 'payments', 'portal']);
const MAX_ROW = 3 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class SyncError extends Error { constructor(message, status) { super(message); this.status = status || 400; } }

function badKeys(v, depth) {
    if (depth > 14) return true;
    if (!v || typeof v !== 'object') return false;
    for (const k of Object.keys(v)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
        if (badKeys(v[k], depth + 1)) return true;
    }
    return false;
}
const clone = o => JSON.parse(JSON.stringify(o));
const find = (raw, t, id) => raw.tables[t].find(r => r.id === id);

function applyOps(engine, ops) {
    const raw = engine.raw(), tables = new Set(engine.tables), C = engine.TOS.crypto, now = new Date().toISOString();
    if (!Array.isArray(ops) || !ops.length) return 0;
    if (ops.length > 5000) throw new SyncError('Too many changes in one request.', 413);

    // ---- 1. Validate everything first, so a bad request changes nothing ----
    for (const o of ops) {
        if (!o || typeof o !== 'object') throw new SyncError('Malformed change.');
        if (o.op === 'setting') {
            if (!GROUPS.has(o.group) || !o.data || typeof o.data !== 'object' || Array.isArray(o.data)) throw new SyncError('Unknown settings group.');
            if (badKeys(o.data, 0)) throw new SyncError('Invalid settings.');
            continue;
        }
        if (!['put', 'patch', 'del'].includes(o.op)) throw new SyncError('Unknown change type.');
        if (!tables.has(o.table)) throw new SyncError('Unknown table: ' + o.table);
        if (typeof o.id !== 'string' || !ID_RE.test(o.id)) throw new SyncError('Invalid record id.');
        const payload = o.op === 'put' ? o.row : o.op === 'patch' ? o.set : null;
        if (o.op !== 'del') {
            if (o.op === 'put' && (!payload || typeof payload !== 'object' || Array.isArray(payload))) throw new SyncError('Malformed record.');
            if (o.op === 'patch' && ((o.set && (typeof o.set !== 'object' || Array.isArray(o.set))) || (o.unset && !Array.isArray(o.unset)))) throw new SyncError('Malformed patch.');
            if (badKeys(payload, 0) || (o.unset || []).some(k => ['__proto__', 'constructor', 'prototype', 'id'].includes(k))) throw new SyncError('Invalid record.');
            if (payload && JSON.stringify(payload).length > MAX_ROW) throw new SyncError('A record is too large.', 413);
            if (payload && 'id' in payload && payload.id !== o.id) throw new SyncError('Record id mismatch.');
        }
        if (o.op === 'patch' && !find(raw, o.table, o.id)) throw new SyncError('A record changed on the server. Reloading.', 409);
        if (o.table === 'users') {
            const existing = find(raw, 'users', o.id), p = payload || {};
            if (p.role === 'admin' && !(existing && existing.role === 'admin')) throw new SyncError('Administrators are created on the server, not here.', 403);
            if (existing && existing.role === 'admin' && 'role' in p && p.role !== 'admin') throw new SyncError('The administrator role cannot be changed here.', 403);
            if (o.op === 'del' && existing && existing.role === 'admin') throw new SyncError('The administrator account cannot be deleted here.', 403);
            if ('password' in p && p.password && String(p.password).length < 8) throw new SyncError('Passwords need at least 8 characters.');
            if ('email' in p && existing && existing.role === 'admin' && p.email !== existing.email && !EMAIL_RE.test(String(p.email))) throw new SyncError('Invalid email address.');
        }
    }

    // ---- 2. Apply ----
    let n = 0;
    for (const o of ops) {
        if (o.op === 'setting') {
            const prev = raw.settings[o.group] || {};
            const next = clone(o.data);
            for (const k of Object.keys(next)) if (k.startsWith('_')) delete next[k];
            delete next.adminPasscodeHash; delete next.adminPasscode;
            for (const k of Object.keys(prev)) if (k.startsWith('_') || k === 'adminPasscodeHash') next[k] = prev[k];   // server-only values stay as they are
            raw.settings[o.group] = next;
            // Changing the administrator's sign-in email in School settings changes the administrator account
            if (o.group === 'school' && next.adminEmail && next.adminEmail !== prev.adminEmail && EMAIL_RE.test(String(next.adminEmail))) {
                const email = String(next.adminEmail).trim().toLowerCase();
                const clash = raw.tables.users.find(u => u.email === email && u.role !== 'admin');
                if (clash) { next.adminEmail = prev.adminEmail; }
                else raw.tables.users.filter(u => u.role === 'admin').forEach(u => { u.email = email; u.updatedAt = now; });
            }
            n++; continue;
        }
        const list = raw.tables[o.table];
        if (o.op === 'del') {
            const i = list.findIndex(r => r.id === o.id); if (i >= 0) { list.splice(i, 1); n++; }
            continue;
        }
        const existing = list.find(r => r.id === o.id);
        const data = o.op === 'put' ? clone(o.row) : clone(o.set || {});
        data.id = o.id;
        // Never trust a password hash from a browser. A plain `password` is hashed here with the server's own function.
        delete data.passwordHash;
        if (o.table === 'users' && 'password' in data) {
            const pw = data.password; delete data.password;
            if (pw) { data.passwordHash = C.hashPassword(String(pw)); data.passwordChangedAt = now; }
        }
        if (o.op === 'put') {
            const keep = existing && (o.table === 'users' || o.table === 'staff_applications') ? existing.passwordHash : undefined;
            const row = data;
            if (o.table === 'users' && !row.passwordHash && existing && existing.passwordHash) row.passwordHash = existing.passwordHash;
            if (o.table === 'staff_applications' && keep) row.passwordHash = keep;
            if (existing) list.splice(list.indexOf(existing), 1, row); else list.push(row);
            // Approving an application creates the staff account. The password the applicant chose lives only on the server:
            // it moves from the application to the new account, and is removed from the application.
            if (o.table === 'users' && !existing && row.applicationId && row.role === 'staff' && !row.passwordHash) {
                const app = find(raw, 'staff_applications', row.applicationId);
                if (app && app.passwordHash) { row.passwordHash = app.passwordHash; delete app.passwordHash; app.updatedAt = now; }
            }
        } else {
            for (const k of Object.keys(data)) existing[k] = data[k];
            for (const k of (o.unset || [])) delete existing[k];
        }
        n++;
    }
    return n;
}

module.exports = { applyOps, SyncError };
