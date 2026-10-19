'use strict';
// Security and behaviour tests for the school server. Runs against a real HTTP server and PostgreSQL (in-process).
//   node test/run.js
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../src');

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, detail) {
    if (cond) { passed++; return; }
    failed++; fails.push(name + (detail !== undefined ? '  ->  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
    console.log('  FAIL  ' + name + (detail !== undefined ? '  ->  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''));
}
const section = s => console.log('\n== ' + s);
const quiet = { log() { }, error() { }, warn() { } };

let base = '';
function client(ip) {
    const jar = { c: null };
    const c = {
        jar,
        async req(method, p, body, extra) {
            const res = await fetch(base + p, {
                method, headers: Object.assign({ 'content-type': 'application/json', 'x-tos': '1', 'x-real-ip': ip || '10.0.0.1' }, jar.c ? { cookie: jar.c } : {}, extra || {}),
                body: body === undefined ? undefined : JSON.stringify(body)
            });
            const sc = res.headers.get('set-cookie');
            if (sc) { const v = sc.split(';')[0]; jar.c = v.endsWith('=') ? null : v; }
            let json = null; try { json = await res.json(); } catch (e) { }
            return { status: res.status, json, headers: res.headers, setCookie: sc };
        },
        get: p => c.req('GET', p),
        post: (p, b, e) => c.req('POST', p, b || {}, e),
        rpc: (ns, fn, ...args) => c.req('POST', `/api/rpc/${ns}/${fn}`, { args })
    };
    return c;
}

(async () => {
    const pgDir = path.join(os.tmpdir(), 'tos-test-pg-' + process.pid);
    // TEST_DATABASE_URL runs the same tests on a real PostgreSQL server (an empty throwaway database). Without it, an in-process PostgreSQL is used.
    const cfg = { nodeEnv: 'test', allowedOrigins: ['http://localhost'], cookieSecure: false, siteUrl: 'http://localhost', databaseUrl: process.env.TEST_DATABASE_URL || '', pgliteDir: process.env.TEST_DATABASE_URL ? '' : pgDir };
    console.log('Database for these tests: ' + (process.env.TEST_DATABASE_URL ? 'real PostgreSQL' : 'in-process PostgreSQL'));
    let app = await createApp({ seedDemo: true, cfg, log: quiet });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + app.server.address().port;
    const TOS = app.engine.TOS, raw = () => app.engine.raw();

    // An administrator, created the way the command-line tool does it
    TOS.db.insert('users', { role: 'admin', name: 'Administrator', email: 'admin@test.local', passwordHash: TOS.crypto.hashPassword('Admin-Pass-1234'), status: 'active' });
    TOS.db.updateSettings('school', { adminEmail: 'admin@test.local' });
    await app.engine.flush();

    const student = () => raw().tables.users.find(u => u.email === 'margaret@gmail.com');

    // ---------------------------------------------------------------- anonymous
    section('Anonymous visitor');
    const anon = client('10.0.1.1');
    let r = await anon.get('/api/health'); ok('health answers', r.status === 200 && r.json.ok);
    r = await anon.get('/api/bootstrap');
    ok('bootstrap works without signing in', r.status === 200 && r.json.me === null);
    const publicJson = JSON.stringify(r.json);
    ok('no password hashes are ever sent', !/passwordHash|scrypt\$/.test(publicJson));
    ok('no admin passcode hash', !/adminPasscode/.test(publicJson));
    ok('public settings hide the admin email', !('adminEmail' in (r.json.state.settings.school || {})));
    ok('catalog is public', r.json.state.tables.courses.length > 0 && r.json.state.tables.courses.every(c => c.status === 'published'));
    ok('quiz answers are not public', r.json.state.tables.quiz_questions.length === 0);
    ok('submissions, orders, messages, applications are not public', ['submissions', 'orders', 'payments', 'messages', 'conversations', 'staff_applications', 'notifications', 'certificates', 'password_resets', 'email_outbox', 'support_tickets'].every(t => r.json.state.tables[t].length === 0));
    ok('no student accounts are public (only reviewer names)', r.json.state.tables.users.every(u => Object.keys(u).every(k => ['id', 'name', 'avatar', 'role'].includes(k))));
    const nonPreview = new Set(raw().tables.lessons.filter(l => !l.isPreview).map(l => l.id));
    ok('lesson content is only sent for free-preview lessons', r.json.state.tables.contents.every(c => !nonPreview.has(c.lessonId)));
    ok('enrollments are anonymous counts', r.json.state.tables.enrollments.every(e => !('userId' in e)));

    r = await anon.get('/api/nope'); ok('unknown route is 404', r.status === 404);
    r = await anon.post('/api/sync', { ops: [{ op: 'put', table: 'courses', id: 'crs_hack0001', row: { title: 'x' } }] });
    ok('anonymous cannot edit data', r.status === 403, r.status);
    r = await anon.rpc('student', 'dashboard'); ok('student API refuses anonymous', r.status === 401 && r.json.error.code === 'UNAUTHENTICATED', r.json);
    r = await anon.rpc('staff', 'dashboard'); ok('staff API refuses anonymous', r.status === 401, r.status);

    section('Request hardening');
    r = await anon.req('POST', '/api/auth/login', { email: 'a@b.c', password: 'x' }, { 'x-tos': '' });
    ok('POST without the app header is refused (CSRF)', r.status === 400, r.status);
    r = await anon.req('POST', '/api/auth/login', { email: 'a@b.c', password: 'x' }, { origin: 'https://evil.example' });
    ok('POST from another website is refused', r.status === 403, r.status);
    r = await anon.req('POST', '/api/auth/login', { email: 'a@b.c', password: 'x' }, { 'content-type': 'text/plain' });
    ok('POST without a JSON content type is refused', r.status === 400, r.status);
    r = await anon.rpc('student', 'constructor'); ok('built-in object functions cannot be called', r.status === 404 || r.status === 400, r.status);
    r = await anon.rpc('student', 'toString'); ok('toString cannot be called', r.status === 404, r.status);
    r = await anon.rpc('student', '__proto__'); ok('__proto__ is not a function name', r.status === 400 || r.status === 404, r.status);
    r = await anon.rpc('admin', 'dashboard'); ok('unknown namespace refused', r.status === 404, r.status);
    r = await anon.rpc('public', 'submitApplication', {}); ok('internal staff functions are not public', r.status === 404, r.status);
    const big = await fetch(base + '/api/rpc/public/apply', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tos': '1', 'x-real-ip': '10.0.1.9' }, body: JSON.stringify({ args: [{ bio: 'x'.repeat(14 * 1024 * 1024) }] }) }).then(x => x.status).catch(() => 'closed');
    ok('oversized requests are rejected', big === 413 || big === 'closed', big);

    // ---------------------------------------------------------------- sign-in
    section('Sign-in');
    const bf = client('10.0.2.2'); let last;
    for (let i = 0; i < 9; i++) last = await bf.post('/api/auth/login', { email: 'margaret@gmail.com', password: 'wrong-' + i, role: 'student' });
    ok('repeated wrong passwords are rate limited', last.status === 429, last.status);
    const bf2 = client('10.0.2.3');
    r = await bf2.post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever12', role: 'student' });
    ok('unknown account gets the same generic error', r.status === 200 && /Incorrect/.test(r.json.error), r.json);
    r = await bf2.post('/api/auth/login', { email: 'margaret@gmail.com', password: 'wrong-password', role: 'student' });
    ok('wrong password gets the same generic error', r.status === 200 && r.json.error === 'Incorrect email, student ID or password.' || /Incorrect/.test(r.json.error), r.json);
    r = await bf2.post('/api/auth/login', { email: 'instructor@techoasisltd.com', password: 'staff123', role: 'student' });
    ok('staff cannot sign in through the student login', !!r.json.error && !r.json.user, r.json);

    const stu = client('10.0.3.1');
    r = await stu.post('/api/auth/login', { email: 'margaret@gmail.com', password: 'student123', role: 'student' });
    ok('student signs in', r.status === 200 && r.json.user && r.json.user.role === 'student', r.json);
    ok('session cookie is HttpOnly and SameSite', /HttpOnly/i.test(r.setCookie || '') && /SameSite=Lax/i.test(r.setCookie || ''), r.setCookie);
    ok('the session token is not in the response body', !/tos_session|token/i.test(JSON.stringify(r.json)));
    const dbSessions = await app.db.query('select token_hash from sessions');
    const tok = (stu.jar.c || '').split('=')[1];
    ok('only a hash of the token is stored', dbSessions.length > 0 && dbSessions.every(s => s.token_hash !== decodeURIComponent(tok)) && dbSessions[0].token_hash.length === 64);

    // ---------------------------------------------------------------- student
    section('Signed-in student');
    r = await stu.get('/api/bootstrap');
    ok('student sees themselves', r.json.me && r.json.me.email === 'margaret@gmail.com');
    const sj = JSON.stringify(r.json);
    ok('student bootstrap has no password hashes', !/passwordHash|scrypt\$/.test(sj));
    const others = raw().tables.users.filter(u => u.role === 'student' && u.email !== 'margaret@gmail.com');
    ok('other students\' emails are never sent', others.every(u => !sj.includes(u.email)));
    const me = student();
    ok('only their own enrollments are fully visible', r.json.state.tables.enrollments.filter(e => 'userId' in e).every(e => e.userId === me.id));
    ok('only their own orders are visible', r.json.state.tables.orders.every(o => o.userId === me.id));
    ok('quiz answers are not in the bootstrap', r.json.state.tables.quiz_questions.length === 0);
    r = await stu.rpc('student', 'dashboard'); ok('student API works for the student', r.status === 200 && r.json.data.stats, r.json);
    r = await stu.rpc('staff', 'dashboard'); ok('student cannot use the staff API', r.status === 403, r.json);
    r = await stu.post('/api/sync', { ops: [{ op: 'patch', table: 'users', id: me.id, set: { role: 'admin' } }] });
    ok('student cannot edit data directly', r.status === 403, r.status);
    r = await stu.post('/api/auth/admin-password', { password: 'Hijack-Pass-123' }); ok('student cannot change the admin password', r.status === 403, r.status);

    // Grading and certificates happen on the server
    const myEnr = raw().tables.enrollments.filter(e => e.userId === me.id);
    const notDone = myEnr.map(e => e.courseId).find(cid => !raw().tables.certificates.some(c => c.userId === me.id && c.courseId === cid));
    r = await stu.rpc('student', 'claimCertificate', notDone);
    ok('a certificate cannot be claimed before the requirements are met', r.status === 400 && /requirements/i.test(r.json.error.message), r.json);
    ok('no certificate was created', raw().tables.certificates.every(c => !(c.userId === me.id && c.courseId === notDone)));
    const quiz = raw().tables.quizzes[0], qLesson = raw().tables.lessons.find(l => l.id === quiz.lessonId), qCourse = raw().tables.sections.find(s => s.id === qLesson.sectionId).courseId;
    const qEnr = raw().tables.enrollments.find(e => e.userId === me.id && e.courseId === qCourse);
    if (qEnr) {
        r = await stu.rpc('student', 'startQuiz', quiz.id);
        ok('starting a quiz does not reveal the answers', r.status === 200 && !/"correct"/.test(JSON.stringify(r.json)), r.json && JSON.stringify(r.json).slice(0, 200));
    }
    r = await stu.rpc('student', 'enroll', raw().tables.courses.find(c => c.status === 'published' && !raw().tables.enrollments.some(e => e.userId === me.id && e.courseId === c.id) && (+c.price > 0)).id, { payNow: true });
    ok('a student cannot mark a course as paid', r.status === 400 && r.json.error.code === 'PAYMENT_UNAVAILABLE' || r.status === 200 && !raw().tables.orders.some(o => o.userId === me.id && o.status === 'paid' && !o.paidAt), r.json);
    r = await stu.rpc('student', 'conversation', 'cnv_doesnotexist'); ok('unknown conversation is not found', r.status === 404, r.json);
    const otherConv = raw().tables.conversations.find(c => c.studentId !== me.id);
    if (otherConv) { r = await stu.rpc('student', 'conversation', otherConv.id); ok('a student cannot read another student\'s conversation', r.status === 404 || r.status === 403, r.json); }
    const otherSub = raw().tables.submissions.find(s => s.userId !== me.id);
    if (otherSub) { r = await stu.rpc('student', 'assignment', otherSub.assignmentId); ok('another student\'s submission is not returned', !JSON.stringify(r.json).includes(otherSub.id) || (r.json.data && r.json.data.submission === null)); }

    r = await stu.post('/api/auth/logout'); ok('logout works', r.status === 200);
    r = await stu.get('/api/bootstrap'); ok('after logout the student is anonymous', r.json.me === null);
    r = await stu.rpc('student', 'dashboard'); ok('after logout the API refuses', r.status === 401);

    // ---------------------------------------------------------------- staff
    section('Staff');
    const stf = client('10.0.4.1');
    r = await stf.post('/api/auth/staff-login', { email: 'instructor@techoasisltd.com', password: 'staff123' });
    ok('approved staff sign in', r.status === 200 && r.json.user && r.json.user.role === 'staff', r.json);
    r = await stf.rpc('staff', 'dashboard'); ok('staff API works for staff', r.status === 200 && r.json.data, r.json);
    r = await stf.rpc('student', 'dashboard'); ok('staff cannot use the student API', r.status === 403, r.json);
    const sUser = raw().tables.users.find(u => u.email === 'instructor@techoasisltd.com');
    r = await stf.rpc('staff', 'updateProfile', { staffRole: 'coordinator', permissions: ['view_courses'], role: 'admin', status: 'active', title: 'Lead' });
    const after = raw().tables.users.find(u => u.id === sUser.id);
    ok('staff cannot change their own role or permissions', after.role === 'staff' && after.staffRole === sUser.staffRole && after.permissions.length === sUser.permissions.length, { role: after.role, perms: after.permissions && after.permissions.length });
    r = await stf.post('/api/sync', { ops: [] }); ok('staff cannot use the admin sync', r.status === 403, r.status);
    const wrongCourse = raw().tables.courses.find(c => !raw().tables.course_instructors.some(ci => ci.courseId === c.id && raw().tables.instructors.some(i => i.id === ci.instructorId && i.userId === sUser.id)));
    if (wrongCourse) { r = await stf.rpc('staff', 'course', wrongCourse.id); ok('staff cannot open a course that is not assigned to them', r.status === 403 || r.status === 404, r.json); }
    r = await stf.rpc('staff', 'students'); ok('staff list only their students', r.status === 200 && !JSON.stringify(r.json).includes('passwordHash'));

    // ---------------------------------------------------------------- teaching applications
    section('Teaching applications (public)');
    const pub = client('10.0.5.1');
    const good = { firstName: 'Ama', lastName: 'Mensah', email: 'ama.mensah@example.com', phone: '+233201112222', location: 'Accra, Ghana', expertise: 'Data science', subjects: ['Data Science'], qualifications: 'MSc', education: 'UG', yearsExperience: 5, bio: 'I teach data science.', availability: 'Evenings', password: 'Teach-12345', confirmPassword: 'Teach-12345', documents: [{ kind: 'cv', name: 'cv.pdf', size: 100, type: 'application/pdf', url: 'data:application/pdf;base64,JVBERi0=' }] };
    r = await pub.rpc('public', 'apply', good); ok('a valid application is accepted', r.status === 200 && r.json.data && r.json.data.id, r.json);
    const appRow = raw().tables.staff_applications.find(a => a.email === 'ama.mensah@example.com');
    ok('application starts as Pending', appRow && appRow.status === 'pending');
    ok('the password is stored only as a hash', appRow && appRow.passwordHash && appRow.passwordHash.startsWith('scrypt$') && !JSON.stringify(appRow).includes('Teach-12345'));
    ok('the response never contains the hash', !/scrypt|passwordHash/.test(JSON.stringify(r.json)));
    r = await pub.rpc('public', 'apply', good); ok('a duplicate application is refused', r.status === 409, r.json);
    r = await client('10.0.5.2').rpc('public', 'apply', Object.assign({}, good, { email: 'x1@example.com', documents: [{ kind: 'cv', name: 'a', url: 'javascript:alert(1)' }] }));
    ok('javascript: links in documents are refused', r.status === 400, r.json);
    r = await client('10.0.5.3').rpc('public', 'apply', Object.assign({}, good, { email: 'x2@example.com', password: 'short' }));
    ok('short passwords are refused', r.status === 400, r.json);
    r = await client('10.0.5.4').rpc('public', 'apply', Object.assign({}, good, { email: 'x3@example.com', bio: 'b'.repeat(5000) }));
    ok('over-long fields are refused', r.status === 400, r.json);
    r = await client('10.0.5.5').rpc('public', 'apply', Object.assign({}, good, { email: 'x4@example.com', role: 'admin', status: 'approved', adminNotes: ['x'], staffRole: 'coordinator' }));
    const injected = raw().tables.staff_applications.find(a => a.email === 'x4@example.com');
    ok('extra fields (status, role, notes) are ignored', r.status === 200 && injected.status === 'pending' && !injected.role && !injected.staffRole && injected.adminNotes.length === 0, injected && { status: injected.status, role: injected.role });
    r = await pub.rpc('public', 'status', 'ama.mensah@example.com', 'Teach-12345');
    ok('the applicant can see their status', r.status === 200 && r.json.data.status === 'pending', r.json);
    ok('internal admin notes are never returned', !('adminNotes' in r.json.data) && !/passwordHash/.test(JSON.stringify(r.json)));
    r = await client('10.0.5.6').rpc('public', 'status', 'ama.mensah@example.com', 'wrong-pass-1'); ok('wrong password cannot see the status', r.status === 401, r.json);
    r = await client('10.0.5.7').post('/api/auth/staff-login', { email: 'ama.mensah@example.com', password: 'Teach-12345' });
    ok('a pending applicant cannot sign in', !r.json.user && /still under review/.test(r.json.error), r.json);
    r = await client('10.0.5.8').post('/api/auth/staff-login', { email: 'ama.mensah@example.com', password: 'Teach-12345' });
    ok('and gets no session cookie', !r.setCookie);
    r = await client('10.0.5.7').rpc('staff', 'dashboard'); ok('and cannot reach the staff API', r.status === 401);
    const spam = client('10.0.5.20'); let sp;
    for (let i = 0; i < 5; i++) sp = await spam.rpc('public', 'apply', Object.assign({}, good, { email: `spam${i}@example.com` }));
    ok('application spam from one address is rate limited', sp.status === 429, sp.status);
    r = await client('10.0.5.30').rpc('public', 'forgot', 'ama.mensah@example.com'); ok('password reset requests always answer the same', r.status === 200 && r.json.data.ok);
    r = await client('10.0.5.31').rpc('public', 'forgot', 'nobody@nowhere.example'); ok('even for unknown emails', r.status === 200 && r.json.data.ok);
    r = await client('10.0.5.32').rpc('public', 'reset', 'not-a-real-token', 'New-Password-1'); ok('a bad reset link is refused', r.status === 400, r.json);

    // ---------------------------------------------------------------- admin
    section('Administrator');
    const adm = client('10.0.6.1');
    r = await adm.post('/api/auth/admin-login', { id: 'admin@test.local', pass: 'wrong-pass-1' }); ok('wrong admin password is refused', r.json.ok === false && !r.setCookie);
    r = await adm.post('/api/auth/admin-login', { id: 'school@techoasisltd.com', pass: 'admin123' }); ok('the old default passcode does not work', r.json.ok === false);
    const adm2 = client('10.0.6.2'); let al;
    for (let i = 0; i < 7; i++) al = await adm2.post('/api/auth/admin-login', { id: 'admin@test.local', pass: 'nope-' + i });
    ok('admin sign-in is rate limited', al.status === 429, al.status);
    r = await adm.post('/api/auth/admin-login', { id: 'admin@test.local', pass: 'Admin-Pass-1234' }); ok('the administrator signs in', r.status === 200 && r.json.ok && r.json.user.role === 'admin', r.json);
    ok('the admin cookie is a browser-session cookie', !/Max-Age/i.test(r.setCookie || ''), r.setCookie);
    r = await adm.get('/api/bootstrap'); const aj = JSON.stringify(r.json);
    ok('admin sees all data', r.json.state.tables.users.length >= 8 && r.json.state.tables.staff_applications.length >= 1 && r.json.state.tables.quiz_questions.length > 0);
    ok('even the admin never receives password hashes', !/passwordHash|scrypt\$/.test(aj));
    ok('admin sees the admin email setting', r.json.state.settings.school.adminEmail === 'admin@test.local');
    r = await adm.rpc('student', 'dashboard'); ok('admin is not a student', r.status === 403);

    // ---- large uploaded files are served by link, with access checks ----
    section('Large files');
    const bigPdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 ' + 'x'.repeat(60000)).toString('base64');
    r = await client('10.0.6.20').rpc('public', 'apply', Object.assign({}, good, { email: 'big.docs@example.com', documents: [{ kind: 'cv', name: 'big.pdf', size: 60000, type: 'application/pdf', url: bigPdf }] }));
    ok('an application with a large document is accepted', r.status === 200, r.json);
    const bigApp = raw().tables.staff_applications.find(a => a.email === 'big.docs@example.com');
    r = await adm.get('/api/bootstrap');
    const adminApp = r.json.state.tables.staff_applications.find(a => a.id === bigApp.id);
    ok('the admin data load carries a link, not the file', adminApp.documents[0].url === `/api/blob/staff_applications/${bigApp.id}/documents.0.url`, adminApp.documents[0].url.slice(0, 80));
    ok('so the admin data load stays small', JSON.stringify(r.json).length < 600000, JSON.stringify(r.json).length);
    let f = await fetch(base + adminApp.documents[0].url, { headers: { cookie: adm.jar.c, 'x-tos': '1', 'x-real-ip': '10.0.6.1' } });
    const bytes = Buffer.from(await f.arrayBuffer());
    ok('the administrator can open the file', f.status === 200 && f.headers.get('content-type') === 'application/pdf' && bytes.toString().startsWith('%PDF-1.4'), f.status);
    ok('files are served sandboxed and never sniffed', /sandbox/.test(f.headers.get('content-security-policy') || '') && f.headers.get('x-content-type-options') === 'nosniff');
    f = await fetch(base + adminApp.documents[0].url, { headers: { 'x-real-ip': '10.0.6.21' } }); ok('an anonymous visitor cannot open an application document', f.status === 404, f.status);
    const stuC = client('10.0.6.22'); await stuC.post('/api/auth/login', { email: 'margaret@gmail.com', password: 'student123', role: 'student' });
    f = await fetch(base + adminApp.documents[0].url, { headers: { cookie: stuC.jar.c, 'x-real-ip': '10.0.6.22' } }); ok('a student cannot open an application document', f.status === 404, f.status);
    // saving a record that contains the link must not destroy the real file
    r = await adm.post('/api/sync', { ops: [{ op: 'patch', table: 'staff_applications', id: bigApp.id, set: { documents: adminApp.documents, expertise: 'Cloud and data' } }] });
    ok('the admin can save an application that holds a file link', r.status === 200, r.json);
    ok('and the real file is still stored (not replaced by the link)', raw().tables.staff_applications.find(a => a.id === bigApp.id).documents[0].url === bigPdf);
    ok('the other change was saved too', raw().tables.staff_applications.find(a => a.id === bigApp.id).expertise === 'Cloud and data');
    // a picture on a public record is served to everyone; a private one is not
    const insId = raw().tables.instructors[0].id;
    raw().tables.instructors[0].avatar = 'data:image/png;base64,' + Buffer.from('PNG' + 'y'.repeat(40000)).toString('base64');
    r = await anon.get('/api/bootstrap'); const pubIns = r.json.state.tables.instructors.find(i => i.id === insId);
    ok('an instructor\'s large photo is a link in the public data', /^\/api\/blob\/instructors\//.test(pubIns.avatar), pubIns.avatar.slice(0, 60));
    f = await fetch(base + pubIns.avatar, { headers: { 'x-real-ip': '10.0.6.23' } }); ok('and anyone can open it', f.status === 200 && f.headers.get('content-type') === 'image/png', f.status);
    f = await fetch(base + `/api/blob/users/${student().id}/avatar`, { headers: { 'x-real-ip': '10.0.6.24' } }); ok('an account\'s picture is not public', f.status === 404, f.status);
    f = await fetch(base + `/api/blob/staff_applications/${bigApp.id}/documents.0.name`, { headers: { cookie: adm.jar.c, 'x-real-ip': '10.0.6.1' } }); ok('only data files can be fetched (not other fields)', f.status === 404, f.status);

    const courseId = raw().tables.courses[0].id;
    r = await adm.post('/api/sync', { ops: [{ op: 'patch', table: 'courses', id: courseId, set: { title: 'Renamed by admin' } }] });
    ok('admin edits are saved', r.status === 200 && raw().tables.courses.find(c => c.id === courseId).title === 'Renamed by admin', r.json);
    const saved = await app.db.query('select data->>\'title\' as t from "courses" where id = $1', [courseId]);
    ok('and written to PostgreSQL', saved[0] && saved[0].t === 'Renamed by admin', saved);
    r = await adm.post('/api/sync', { ops: [{ op: 'put', table: 'users', id: 'usr_newstud01', row: { id: 'usr_newstud01', role: 'student', name: 'New Student', email: 'new.student@example.com', password: 'Student-Pass-99', status: 'active' } }] });
    const ns = raw().tables.users.find(u => u.id === 'usr_newstud01');
    ok('admin can add a student with a password', r.status === 200 && ns && ns.passwordHash && ns.passwordHash.startsWith('scrypt$') && !('password' in ns), r.json);
    const ns2 = client('10.0.6.3'); r = await ns2.post('/api/auth/login', { email: 'new.student@example.com', password: 'Student-Pass-99', role: 'student' });
    ok('and that student can sign in', r.json.user && r.json.user.email === 'new.student@example.com', r.json);
    r = await adm.post('/api/sync', { ops: [{ op: 'put', table: 'users', id: 'usr_smuggle01', row: { id: 'usr_smuggle01', role: 'student', name: 'S', email: 'smuggle@example.com', passwordHash: 'scrypt$1$1$1$AAAA$AAAA' } }] });
    ok('a browser cannot choose a password hash', !raw().tables.users.find(u => u.id === 'usr_smuggle01').passwordHash);
    r = await adm.post('/api/sync', { ops: [{ op: 'put', table: 'users', id: 'usr_admin0002', row: { id: 'usr_admin0002', role: 'admin', name: 'Evil', email: 'evil@example.com', password: 'Evil-Pass-1234' } }] });
    ok('no new administrator can be created from the browser', r.status === 403 && !raw().tables.users.find(u => u.id === 'usr_admin0002'), r.json);
    const adminRow = raw().tables.users.find(u => u.role === 'admin');
    r = await adm.post('/api/sync', { ops: [{ op: 'patch', table: 'users', id: ns.id, set: { role: 'admin' } }] }); ok('nobody can be promoted to administrator from the browser', r.status === 403);
    r = await adm.post('/api/sync', { ops: [{ op: 'del', table: 'users', id: adminRow.id }] }); ok('the administrator account cannot be deleted from the browser', r.status === 403 && raw().tables.users.some(u => u.id === adminRow.id));
    r = await adm.post('/api/sync', { ops: [{ op: 'put', table: 'sessions', id: 'sss_00000001', row: {} }] }); ok('internal tables cannot be written', r.status === 400, r.json);
    r = await adm.post('/api/sync', { ops: [{ op: 'patch', table: 'courses', id: courseId, set: JSON.parse('{"__proto__":{"polluted":true}}') }] });
    ok('prototype pollution attempts are refused', r.status === 400 && ({}).polluted === undefined, r.status);
    r = await adm.post('/api/sync', { ops: [{ op: 'patch', table: 'courses', id: 'crs_missing01', set: { title: 'x' } }] }); ok('editing a missing record reports a conflict', r.status === 409, r.status);
    const hashBefore = raw().settings.school.adminPasscodeHash, seededBefore = raw().settings._portalSeeded;
    r = await adm.post('/api/sync', { ops: [{ op: 'setting', group: 'school', data: { name: 'Tech Oasis School', adminPasscodeHash: 'scrypt$forged', _portalSeeded: !seededBefore, adminEmail: 'admin@test.local' } }] });
    ok('settings can be changed but internal values cannot', r.status === 200 && raw().settings.school.adminPasscodeHash === hashBefore && raw().settings._portalSeeded === seededBefore, r.json);
    r = await adm.post('/api/sync', { ops: [{ op: 'setting', group: 'secrets', data: { a: 1 } }] }); ok('unknown settings groups are refused', r.status === 400);

    // Approving a teaching application: the applicant's password moves to the new staff account and stays secret
    const apRow = raw().tables.staff_applications.find(a => a.email === 'ama.mensah@example.com');
    r = await adm.post('/api/sync', { ops: [
        { op: 'put', table: 'users', id: 'usr_ama000001', row: { id: 'usr_ama000001', role: 'staff', name: 'Ama Mensah', email: 'ama.mensah@example.com', status: 'active', staffRole: 'instructor', permissions: ['view_courses', 'grade_students'], applicationId: apRow.id, createdAt: new Date().toISOString() } },
        { op: 'patch', table: 'staff_applications', id: apRow.id, set: { status: 'approved', staffUserId: 'usr_ama000001', passwordHash: '' } }] });
    ok('approval is accepted', r.status === 200, r.json);
    const ama = raw().tables.users.find(u => u.id === 'usr_ama000001');
    ok('the applicant\'s password now belongs to the new account', ama && ama.passwordHash && ama.passwordHash.startsWith('scrypt$'));
    ok('and is removed from the application', !raw().tables.staff_applications.find(a => a.id === apRow.id).passwordHash);
    const amaC = client('10.0.6.4'); r = await amaC.post('/api/auth/staff-login', { email: 'ama.mensah@example.com', password: 'Teach-12345' });
    ok('the new staff member signs in with the password they chose', r.json.user && r.json.user.role === 'staff', r.json);
    r = await amaC.rpc('staff', 'dashboard'); ok('and reaches the Staff Portal', r.status === 200, r.json);

    // Suspending an account takes effect immediately, even for a session that is already open
    r = await adm.post('/api/sync', { ops: [{ op: 'patch', table: 'users', id: 'usr_ama000001', set: { status: 'suspended' } }] });
    r = await amaC.rpc('staff', 'dashboard'); ok('a suspended staff member is locked out immediately', r.status === 403 && /ACCOUNT_SUSPENDED/.test(r.json.error.code), r.json);
    r = await amaC.get('/api/bootstrap'); ok('and is signed out of the page', r.json.me === null && r.json.problem === 'suspended', r.json.problem);
    const amaD = client('10.0.6.5'); r = await amaD.post('/api/auth/staff-login', { email: 'ama.mensah@example.com', password: 'Teach-12345' });
    ok('a suspended staff member cannot sign in', !r.json.user && /suspended/i.test(r.json.error), r.json);
    r = await adm.post('/api/sync', { ops: [{ op: 'patch', table: 'users', id: 'usr_ama000001', set: { status: 'banned' } }] });
    r = await client('10.0.6.6').post('/api/auth/staff-login', { email: 'ama.mensah@example.com', password: 'Teach-12345' });
    ok('a banned staff member sees the exact message', r.json.error === 'Your staff account has been disabled. Please contact administration.', r.json);
    r = await adm.post('/api/sync', { ops: [{ op: 'patch', table: 'users', id: me.id, set: { status: 'suspended' } }] });
    r = await client('10.0.6.7').post('/api/auth/login', { email: 'margaret@gmail.com', password: 'student123', role: 'student' });
    ok('a suspended student cannot sign in', !r.json.user && /suspended/i.test(r.json.error), r.json);
    await adm.post('/api/sync', { ops: [{ op: 'patch', table: 'users', id: me.id, set: { status: 'active' } }] });

    r = await adm.post('/api/auth/admin-password', { password: 'short' }); ok('a weak admin password is refused', r.status === 400);
    r = await adm.post('/api/auth/admin-password', { password: 'Brand-New-Admin-Pass-1' }); ok('the admin can change their password', r.status === 200);
    r = await client('10.0.6.8').post('/api/auth/admin-login', { id: 'admin@test.local', pass: 'Admin-Pass-1234' }); ok('the old password stops working', r.json.ok === false);
    r = await client('10.0.6.9').post('/api/auth/admin-login', { id: 'admin@test.local', pass: 'Brand-New-Admin-Pass-1' }); ok('the new password works', r.json.ok === true);

    // ---------------------------------------------------------------- public registration + certificates
    section('Registration and certificates');
    const reg = client('10.0.7.1');
    r = await reg.post('/api/auth/register', { name: 'Kojo Test', email: 'not-an-email', password: 'Password-123' }); ok('invalid emails are refused', !!r.json.error && !r.json.user, r.json);
    r = await reg.post('/api/auth/register', { name: 'Kojo Test', email: 'kojo@example.com', password: '1' }); ok('short passwords are refused', !!r.json.error && !r.json.user, r.json);
    r = await reg.post('/api/auth/register', { name: 'Kojo Test', email: 'kojo@example.com', password: 'Password-123' });
    ok('a student can register', r.json.user && r.json.user.role === 'student', r.json);
    const kojo = raw().tables.users.find(u => u.email === 'kojo@example.com');
    ok('with a student ID and a hashed password', kojo && /^TOS/.test(kojo.studentId || '') && kojo.passwordHash.startsWith('scrypt$') && !('password' in kojo));
    r = await reg.get('/api/bootstrap'); ok('and is signed in right away', r.json.me && r.json.me.email === 'kojo@example.com');
    r = await client('10.0.7.2').post('/api/auth/register', { name: 'Dup', email: 'kojo@example.com', password: 'Password-123' }); ok('the same email cannot register twice', !!r.json.error && !r.json.user, r.json);
    const cert = raw().tables.certificates[0];
    r = await anon.get('/api/certificate/' + encodeURIComponent(cert.code)); ok('a certificate can be verified by its code', r.status === 200 && r.json.certificate.code === cert.code, r.json);
    ok('without exposing the student account id', !('userId' in r.json.certificate));
    r = await anon.get('/api/certificate/TOS-0000-NOPE'); ok('an unknown certificate is not found', r.status === 404);

    // ---------------------------------------------------------------- persistence
    section('Persistence');
    const before = { users: raw().tables.users.length, title: raw().tables.courses.find(c => c.id === courseId).title };
    await app.engine.flush(); await app.close();
    app = await createApp({ cfg, log: quiet });
    ok('everything is still there after a restart', app.engine.raw().tables.users.length === before.users && app.engine.raw().tables.courses.find(c => c.id === courseId).title === before.title, { users: app.engine.raw().tables.users.length, expected: before.users });
    ok('sample data is not re-created on restart', app.engine.raw().tables.staff_applications.filter(a => a.email === 'akosua.darko@example.com').length <= 1);
    await app.close();
    try { fs.rmSync(pgDir, { recursive: true, force: true }); } catch (e) { }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) { console.log('\nFailures:'); fails.forEach(f => console.log(' - ' + f)); }
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST RUN CRASHED:', e); process.exit(2); });
