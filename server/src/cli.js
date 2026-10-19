'use strict';
// Server administration commands (run on the VPS):
//   node src/cli.js create-admin [email]     create the administrator, or reset their password
//   node src/cli.js seed-catalog             load the sample programmes (no people), to edit instead of starting blank
//   node src/cli.js seed-demo                load the whole sample school (only into an EMPTY database; for testing)
//   node src/cli.js backup <file>            write a JSON copy of all school data
//   node src/cli.js stats                    row counts
const readline = require('readline');
const fs = require('fs');
const cfg = require('./config');
const store = require('./store');
const { Engine } = require('./engine');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function ask(question, hidden) {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        if (hidden) rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(question); };
        rl.question(question, a => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
    });
}

async function main() {
    const [cmd, arg] = process.argv.slice(2);
    if (!['create-admin', 'seed-demo', 'seed-catalog', 'backup', 'stats'].includes(cmd)) {
        console.log('Usage: node src/cli.js create-admin [email] | seed-catalog | seed-demo | backup <file> | stats'); process.exit(1);
    }
    if (!cfg.databaseUrl && !process.env.PGLITE_DIR) { console.error('Set DATABASE_URL (see server/README.md).'); process.exit(1); }
    const db = await store.open(cfg);
    const engine = await Engine.create({ db, seedDemo: cmd === 'seed-demo' });
    const TOS = engine.TOS, raw = engine.raw();

    if (cmd === 'create-admin') {
        let email = String(arg || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        if (!email) email = String(await ask('Administrator email: ')).trim().toLowerCase();
        if (!EMAIL_RE.test(email)) { console.error('That is not a valid email address.'); process.exit(1); }
        let pw = process.env.ADMIN_PASSWORD || '';
        if (!pw) { pw = await ask('New password (at least 10 characters): ', true); const again = await ask('Repeat password: ', true); if (pw !== again) { console.error('The passwords do not match.'); process.exit(1); } }
        if (pw.length < 10) { console.error('Use at least 10 characters.'); process.exit(1); }
        const clash = raw.tables.users.find(u => u.email === email && u.role !== 'admin');
        if (clash) { console.error('A student or staff account already uses that email.'); process.exit(1); }
        let admin = raw.tables.users.find(u => u.role === 'admin' && u.email === email) || (raw.tables.users.filter(u => u.role === 'admin').length === 1 && !process.env.ADMIN_NEW ? raw.tables.users.find(u => u.role === 'admin') : null);
        const hash = TOS.crypto.hashPassword(pw);
        if (admin) { TOS.db.update('users', admin.id, { email, passwordHash: hash, passwordChangedAt: TOS.db.now(), status: 'active' }); console.log('Updated the administrator account: ' + email); }
        else { TOS.db.insert('users', { role: 'admin', name: 'Administrator', email, passwordHash: hash, status: 'active' }); console.log('Created the administrator account: ' + email); }
        TOS.db.updateSettings('school', { adminEmail: email });
        await db.query('delete from sessions where user_id in (select data->>\'id\' from "users" where data->>\'role\' = \'admin\')');
    }
    if (cmd === 'seed-catalog') {
        // Loads the sample programmes (categories, courses, lessons, quizzes, assignments, instructor profiles) so a new school
        // can edit real content instead of starting blank. No students, orders, reviews or logins are created.
        if (raw.tables.courses.length) console.log('This school already has programmes, so nothing was loaded.');
        else {
            const demoDb = await store.open({});
            const demo = await Engine.create({ db: demoDb, seedDemo: true, log: { log() { }, error() { } } });
            const KEEP = ['categories', 'courses', 'instructors', 'course_instructors', 'sections', 'lessons', 'contents', 'quizzes', 'quiz_questions', 'assignments', 'resources'];
            const clone = o => JSON.parse(JSON.stringify(o));
            for (const t of KEEP) raw.tables[t] = clone(demo.raw().tables[t]);
            raw.tables.instructors.forEach(i => { i.userId = null; });     // profiles only: no sign-in accounts
            await demo.close();
            console.log(`Loaded ${raw.tables.courses.length} sample programmes in ${raw.tables.categories.length} categories. Edit or delete them in Admin → Courses.`);
        }
    }
    if (cmd === 'seed-demo') console.log(raw.tables.users.length > 0 ? 'Demo data is loaded (sample students, staff and courses).' : 'Nothing loaded.');
    if (cmd === 'backup') {
        const file = arg || `backup-${new Date().toISOString().slice(0, 10)}.json`;
        fs.writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), settings: raw.settings, tables: raw.tables }), { mode: 0o600 });
        console.log('Wrote ' + file);
    }
    if (cmd === 'stats') for (const t of engine.tables) console.log(t.padEnd(22), raw.tables[t].length);

    await engine.flush();
    await engine.close();
}
main().catch(e => { console.error(e); process.exit(1); });
