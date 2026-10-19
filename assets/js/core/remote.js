// Connects the pages to the school server (PostgreSQL). Loaded right after db.js on every page.
//
// On the school's website the data no longer lives in each visitor's browser: this file loads what the visitor is allowed to
// see from the server when the page starts, and (for the administrator) sends every change back. Everything a student or staff
// member does goes through the server's API, which checks who they are before doing anything (see remote-api.js).
// On any other address (plain demo) this file does nothing and the site keeps working from the browser's own storage.
//
// Turn it on elsewhere for testing with  ?api=1  (and off again with  ?api=0).
(function () {
    const TOS = window.TOS = window.TOS || {};
    const HOSTS = ['school.techoasisltd.com', 'www.school.techoasisltd.com'];
    let on = HOSTS.includes(location.hostname);
    try {
        const q = new URLSearchParams(location.search).get('api');
        if (q === '1') localStorage.setItem('tos_api', '1'); else if (q === '0') localStorage.removeItem('tos_api');
        if (localStorage.getItem('tos_api') === '1') on = true;
    } catch (e) { }
    if (!on || !TOS.db) return;
    // Old demo data and sign-ins saved by earlier versions of the site no longer apply; remove them from this browser
    try { ['tos_lms_v1', 'to_current_user', 'tos_admin_session'].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); }); } catch (e) { }

    const db = TOS.db;
    const R = TOS.remote = { me: null, problem: 'none', rev: null, pending: 0, refreshing: false, failed: false, handlers: { data: [], session: [] } };
    TOS.config = Object.assign({}, TOS.config, { serverConnected: true });
    const GROUPS = ['school', 'courses', 'certificates', 'payments', 'portal'];

    // ---------- errors and requests ----------
    const mkError = (code, message) => { const E = (TOS.api && TOS.api.ApiError) || Error; const e = new E(code, message); if (!(e instanceof Error) || e.message === code) { e.message = message; } e.code = code; return e; };
    R.error = mkError;
    async function request(method, path, body, opts) {
        let res;
        try {
            res = await fetch(path, { method, credentials: 'same-origin', keepalive: !!(opts && opts.keepalive), headers: method === 'GET' ? { 'X-TOS': '1' } : { 'Content-Type': 'application/json', 'X-TOS': '1' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
        } catch (e) { throw mkError('NETWORK', 'We could not reach the school server. Check your connection and try again.'); }
        let json = null; try { json = await res.json(); } catch (e) { }
        if (!res.ok) {
            const er = (json && json.error) || {};
            if (res.status === 401 && R.me) { R.me = null; R.problem = 'none'; fire('session'); }
            throw mkError(er.code || 'ERROR', er.message || 'Something went wrong. Please try again.');
        }
        return json;
    }
    R.get = path => request('GET', path);
    R.post = (path, body, opts) => request('POST', path, body, opts);
    R.rpc = async (ns, fn, args) => { const j = await request('POST', `/api/rpc/${ns}/${fn}`, { args: args || [] }); if (j.rev) R.rev = j.rev; return j.data; };

    // ---------- events ----------
    R.on = (kind, fn) => { (R.handlers[kind] = R.handlers[kind] || []).push(fn); };
    function fire(kind) { (R.handlers[kind] || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

    // ---------- loading the data ----------
    const adapter = { cache: { meta: { version: 1 }, settings: {}, tables: {} }, load() { return this.cache; }, save: state => save(state), clear() { }, onExternalChange() { } };
    function snapshotBase(state) {
        const base = { tables: new Map(), settings: new Map() };
        if (!R.me || R.me.role !== 'admin') return base;
        db.TABLES.forEach(t => { const m = new Map(); (state.tables[t] || []).forEach(r => m.set(r.id, JSON.stringify(r))); base.tables.set(t, m); });
        GROUPS.forEach(g => { if (state.settings[g]) base.settings.set(g, JSON.stringify(state.settings[g])); });
        return base;
    }
    function hydrate(boot, live) {
        R.me = boot.me || null; R.problem = boot.problem || 'none'; R.rev = boot.rev;
        adapter.cache = { meta: { version: 1, createdAt: boot.serverTime }, settings: boot.state.settings || {}, tables: boot.state.tables || {} };
        db.setAdapter(adapter);
        const state = db.rawState();
        R.base = snapshotBase(state);
        if (live) db.reload();
    }
    // The first load is synchronous on purpose: every page script that follows can then read the data exactly as it always did.
    function bootstrapNow() {
        try {
            const x = new XMLHttpRequest();
            x.open('GET', '/api/bootstrap', false); x.setRequestHeader('X-TOS', '1'); x.send(null);
            if (x.status !== 200) throw new Error('status ' + x.status);
            hydrate(JSON.parse(x.responseText), false);
        } catch (e) {
            R.failed = true; db.setAdapter(adapter); db.rawState();
            const box = document.createElement('div');
            box.setAttribute('role', 'alert');
            box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#F5F3EE;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;color:#0A1F1A;text-align:center';
            box.innerHTML = '<div style="max-width:420px"><div style="font-size:22px;font-weight:700">We can\'t reach the school right now</div><p style="margin:12px 0 20px;color:#59667A;line-height:1.5">Please check your internet connection and try again in a moment. Your information is safe.</p><button onclick="location.reload()" style="background:#0C3B2E;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-weight:600;cursor:pointer">Try again</button></div>';
            (document.body || document.documentElement).appendChild(box);
            console.error('School server unreachable:', e);
        }
    }
    bootstrapNow();

    R.refresh = async function () {
        if (R.refreshing) return;
        R.refreshing = true;
        try { hydrate(await R.get('/api/bootstrap'), true); fire('data'); }
        finally { R.refreshing = false; }
    };
    // After signing in or out the visitor's own data (or the administrator's) replaces the public copy
    R.setUser = async function (user) { R.me = user || null; R.problem = 'none'; await R.refresh(); fire('session'); };

    // ---------- saving (administrator) ----------
    const clone = o => JSON.parse(JSON.stringify(o));
    function diff(state) {
        const ops = [], base = R.base, next = { tables: new Map(), settings: new Map() };
        db.TABLES.forEach(t => {
            const prev = base.tables.get(t) || new Map(), cur = new Map();
            (state.tables[t] || []).forEach(row => {
                const json = JSON.stringify(row); cur.set(row.id, json);
                const old = prev.get(row.id);
                if (old === undefined) ops.push({ op: 'put', table: t, id: row.id, row: JSON.parse(json) });
                else if (old !== json) {
                    const before = JSON.parse(old), set = {}, unset = [];
                    Object.keys(row).forEach(k => { if (JSON.stringify(row[k]) !== JSON.stringify(before[k])) set[k] = JSON.parse(JSON.stringify(row[k])); });
                    Object.keys(before).forEach(k => { if (!(k in row)) unset.push(k); });
                    ops.push({ op: 'patch', table: t, id: row.id, set, unset });
                }
            });
            prev.forEach((_, id) => { if (!cur.has(id)) ops.push({ op: 'del', table: t, id }); });
            next.tables.set(t, cur);
        });
        GROUPS.forEach(g => {
            if (!state.settings[g]) return;
            const json = JSON.stringify(state.settings[g]); next.settings.set(g, json);
            if (base.settings.get(g) !== json) ops.push({ op: 'setting', group: g, data: JSON.parse(json) });
        });
        R.base = next;
        return ops;
    }
    let chain = Promise.resolve();
    function save(state) {
        if (!R.me || R.me.role !== 'admin') return true;       // only the administrator's changes are ever sent
        const ops = diff(state);
        if (!ops.length) return true;
        const hasPassword = ops.some(o => o.table === 'users' && ((o.row && 'password' in o.row) || (o.set && 'password' in o.set)));
        R.pending++;
        chain = chain.then(() => R.post('/api/sync', { ops })).then(res => {
            R.pending--; R.rev = res.rev;
            return hasPassword ? R.refresh() : null;
        }).catch(err => {
            R.pending--;
            (TOS.ui && TOS.ui.toast) ? TOS.ui.toast(err.message || 'The change could not be saved.', 'error') : console.error(err);
            return R.refresh().catch(() => { });                 // show what the server really has
        });
        return true;
    }
    R.flush = () => chain;

    // ---------- staying current ----------
    async function poll() {
        if (document.hidden || R.pending || R.refreshing || R.failed) return;
        try {
            const j = await R.get('/api/rev');
            const uid = R.me ? R.me.id : null;
            if (j.uid !== uid) { await R.refresh(); fire('session'); }
            else if (j.rev !== R.rev) await R.refresh();
        } catch (e) { /* offline: try again next time */ }
    }
    setInterval(poll, 25000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

    // ---------- certificate lookup (public, by code) ----------
    R.certificate = async function (code) {
        const j = await R.get('/api/certificate/' + encodeURIComponent(code));
        const list = db.rawState().tables.certificates;
        if (j.certificate && !list.some(c => c.id === j.certificate.id)) list.push(clone(j.certificate));
        return j.certificate;
    };
})();
