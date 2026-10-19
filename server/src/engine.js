'use strict';
// The engine runs the school's own logic (assets/js/core/*: data rules, grading, certificates, enrollment, staff
// approval, the student and staff APIs) on the server, against the school's data held in memory and saved to
// PostgreSQL after every change. Browsers can only ask the server to run these functions as a signed-in user, so the
// checks inside them (who you are, what you own, what you are allowed to do) can no longer be skipped from the browser.
//
// Node runs one request at a time through this code, so two requests can never interleave halfway through a change.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const store = require('./store');

const CORE = path.resolve(__dirname, '../../assets/js/core');
const SESSION_KEY = 'to_current_user';
// Same order as the page scripts. crypto.js is replaced by the server's native version.
const LOAD_ORDER = ['ui', 'crypto', 'db', 'seed', 'lms', 'video', 'auth', 'engage', 'staff', 'api', 'staff-api'];

function mkStorage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; }

class Engine {
    static async create({ db, seedDemo = false, log = console } = {}) {
        const e = new Engine(db, log);
        await e.boot(seedDemo);
        return e;
    }

    constructor(db, log) {
        this.dbh = db; this.log = log;
        this.chain = Promise.resolve();
        this.snap = new Map(); this.snapSettings = new Map();
        this.bootId = nodeCrypto.randomBytes(3).toString('hex'); this.n = 0;
        this.initial = null;
        this.local = mkStorage(); this.sess = mkStorage();

        const ctx = {
            console, URL, URLSearchParams, Intl, setTimeout, clearTimeout, setInterval, clearInterval,
            TextEncoder, TextDecoder, crypto: nodeCrypto.webcrypto, __nodeCrypto: nodeCrypto, Buffer,
            localStorage: this.local, sessionStorage: this.sess,
            location: { href: 'http://localhost/', origin: 'http://localhost', search: '', hostname: 'localhost' },
            document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() { }, documentElement: { classList: { toggle() { }, add() { }, remove() { } } } },
            TOS: { serverMode: true }
        };
        ctx.window = ctx; ctx.window.addEventListener = () => { };
        this.ctx = vm.createContext(ctx);
        for (const f of LOAD_ORDER) {
            const file = f === 'crypto' ? path.join(__dirname, 'crypto-server.js') : path.join(CORE, f + '.js');
            vm.runInContext(fs.readFileSync(file, 'utf8'), this.ctx, { filename: f + '.js' });
        }
        vm.runInContext(fs.readFileSync(path.join(__dirname, 'vm-public.js'), 'utf8'), this.ctx, { filename: 'vm-public.js' });
        this.TOS = this.ctx.TOS;
        this.tables = this.TOS.db.TABLES.slice();
        this.runner = vm.runInContext('(function (path, args) { var o = globalThis, p = null; var parts = path.split("."); for (var i = 0; i < parts.length; i++) { p = o; o = o[parts[i]]; } if (typeof o !== "function") throw new Error("Unknown function " + path); return o.apply(p, args); })', this.ctx);
        const self = this;
        this.adapter = { load: () => self.initial, save: () => true, clear() { }, onExternalChange() { } };
    }

    async boot(seedDemo) {
        await store.ensureSchema(this.dbh, this.tables);
        const loaded = await store.loadState(this.dbh, this.tables);
        if (loaded) {
            this.initial = loaded;
            this.initial.meta = Object.assign({ version: 1, createdAt: new Date().toISOString() }, this.initial.meta);
            this.rebuildSnapshot();
        } else if (!seedDemo) {
            // A fresh production database starts empty: no sample students, courses or applications
            this.initial = { meta: { version: 1, createdAt: new Date().toISOString() }, settings: { _portalSeeded: true, _staffSeeded: true, _legacyMigrated: true }, tables: {} };
        } // else: initial stays null and the data layer seeds the demo content on first use
        this.TOS.db.setAdapter(this.adapter);
        this.TOS.db.settings();            // first use: runs the data migrations
        await this.flush();                // saves whatever the migrations or the demo seed created
    }

    // ---- Access to the live data (never hand rows to a browser without going through snapshots.js) ----
    raw() { return this.TOS.db.rawState(); }
    get rev() { return this.bootId + ':' + this.n; }

    // ---- Saving ----
    rebuildSnapshot() {
        this.snap = new Map(); this.snapSettings = new Map();
        for (const t of this.tables) { const m = new Map(); for (const r of (this.initial.tables[t] || [])) m.set(r.id, JSON.stringify(r)); this.snap.set(t, m); }
        for (const g of Object.keys(this.initial.settings || {})) this.snapSettings.set(g, JSON.stringify(this.initial.settings[g]));
    }
    diff() {
        const raw = this.raw(), ops = [], snap = new Map(), snapSettings = new Map();
        for (const t of this.tables) {
            const prev = this.snap.get(t) || new Map(), cur = new Map();
            for (const row of raw.tables[t] || []) {
                if (!row || typeof row.id !== 'string') continue;
                const s = JSON.stringify(row); cur.set(row.id, s);
                if (prev.get(row.id) !== s) ops.push({ t: 'put', table: t, id: row.id, json: s });
            }
            for (const id of prev.keys()) if (!cur.has(id)) ops.push({ t: 'del', table: t, id });
            snap.set(t, cur);
        }
        for (const g of Object.keys(raw.settings || {})) {
            const s = JSON.stringify(raw.settings[g]); snapSettings.set(g, s);
            if (this.snapSettings.get(g) !== s) ops.push({ t: 'setting', grp: g, json: s });
        }
        return { ops, snap, snapSettings };
    }
    // Writes every change since the last successful save, in one transaction. Safe to call from many requests.
    flush() {
        const run = async () => {
            const { ops, snap, snapSettings } = this.diff();
            if (!ops.length) return 0;
            await store.writeOps(this.dbh, ops);
            this.snap = snap; this.snapSettings = snapSettings; this.n++;
            return ops.length;
        };
        const p = this.chain.then(run, run);
        this.chain = p.catch(e => { this.log.error('[engine] save failed:', e.message); });
        return p;
    }
    // After a failed save the in-memory data may be ahead of the database: rebuild it from the database.
    async reloadFromDb() {
        const loaded = await store.loadState(this.dbh, this.tables);
        this.initial = loaded || this.initial;
        this.rebuildSnapshot();
        this.TOS.db.setAdapter(this.adapter);
        this.TOS.db.settings();
    }

    // ---- Running the site's functions as a signed-in user ----
    // The session slot is held only while the function runs (it is synchronous), then cleared before anything else can run.
    withUser(userId, role, fn) {
        this.local.clear(); this.sess.clear();
        if (userId) this.local.setItem(SESSION_KEY, JSON.stringify({ id: userId, role: role || null, ts: Date.now() }));
        try { return fn(); } finally { this.local.clear(); this.sess.clear(); }
    }
    // Starts the call as `userId` and returns its (already settled) result. Does not await inside the session window.
    callAs(userId, role, fnPath, args) {
        const result = this.withUser(userId, role, () => this.runner(fnPath, args || []));
        return Promise.resolve(result);
    }
    // For login/register: the site's own auth functions "start a session"; we capture who it started it for.
    captureLogin(fnPath, args) {
        this.local.clear(); this.sess.clear();
        let result;
        try { result = this.runner(fnPath, args || []); }
        finally { /* read below */ }
        const raw = this.local.getItem(SESSION_KEY) || this.sess.getItem(SESSION_KEY);
        this.local.clear(); this.sess.clear();
        let who = null; try { who = raw ? JSON.parse(raw) : null; } catch (e) { }
        return { result, userId: who && who.id };
    }
    // Plain function call with no user (public endpoints)
    callPublic(fnPath, args) { return this.callAs(null, null, fnPath, args); }

    close() { return this.dbh.close(); }
}

module.exports = { Engine, SESSION_KEY };
