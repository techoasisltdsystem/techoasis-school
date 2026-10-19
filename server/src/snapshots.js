'use strict';
// What each kind of visitor is allowed to receive from the server. Anything not listed here is never sent.
//   public   : the published catalog (what the homepage and course pages show)
//   student  : public + their own enrollments, orders, certificates and progress (the portal itself uses the API)
//   staff    : public + their own account
//   admin    : everything except secrets (password hashes, internal tokens)
// Quiz answers, assignment briefs, lesson content of paid lessons, other people's accounts and private messages are
// reachable only through the student/staff API, which checks ownership and permission on every call.

const clone = o => JSON.parse(JSON.stringify(o));
const omit = (o, keys) => { const c = Object.assign({}, o); for (const k of keys) delete c[k]; return c; };
const pick = (o, keys) => { const c = {}; for (const k of keys) if (k in o) c[k] = o[k]; return c; };

const USER_SECRETS = ['passwordHash', 'password'];
const ownUser = u => omit(u, USER_SECRETS);

function settingsFor(raw, isAdmin) {
    const out = {};
    for (const g of Object.keys(raw.settings || {})) {
        if (g.startsWith('_')) continue;
        const v = raw.settings[g];
        out[g] = v && typeof v === 'object' && !Array.isArray(v) ? omit(v, Object.keys(v).filter(k => k.startsWith('_'))) : v;
    }
    if (out.school) { delete out.school.adminPasscodeHash; delete out.school.adminPasscode; if (!isAdmin) delete out.school.adminEmail; }
    return clone(out);
}

function emptyTables(tables) { const o = {}; for (const t of tables) o[t] = []; return o; }

function publicTables(raw, tables) {
    const T = raw.tables, out = emptyTables(tables);
    const courses = T.courses.filter(c => c.status === 'published');
    const courseIds = new Set(courses.map(c => c.id));
    const sections = T.sections.filter(s => courseIds.has(s.courseId) && s.status === 'published');
    const sectionIds = new Set(sections.map(s => s.id));
    const lessons = T.lessons.filter(l => sectionIds.has(l.sectionId) && l.status === 'published');
    const lessonIds = new Set(lessons.map(l => l.id));
    const previewIds = new Set(lessons.filter(l => l.isPreview).map(l => l.id));
    const instructors = T.instructors.filter(i => i.active !== false);
    const instructorIds = new Set(instructors.map(i => i.id));
    const reviews = T.reviews.filter(r => r.status === 'published' && courseIds.has(r.courseId));
    const reviewerIds = new Set(reviews.map(r => r.userId));

    out.categories = T.categories.map(clone);
    out.courses = courses.map(clone);
    out.sections = sections.map(clone);
    out.lessons = lessons.map(clone);
    out.contents = T.contents.filter(c => previewIds.has(c.lessonId)).map(clone);        // only free-preview lessons
    out.quizzes = T.quizzes.filter(q => lessonIds.has(q.lessonId)).map(q => pick(q, ['id', 'lessonId', 'title', 'createdAt', 'updatedAt']));
    out.assignments = T.assignments.filter(a => lessonIds.has(a.lessonId)).map(a => pick(a, ['id', 'lessonId', 'title', 'maxScore', 'dueDays', 'dueDate']));
    out.instructors = instructors.map(i => pick(i, ['id', 'name', 'title', 'bio', 'avatar', 'createdAt', 'updatedAt']));
    out.course_instructors = T.course_instructors.filter(ci => courseIds.has(ci.courseId) && instructorIds.has(ci.instructorId)).map(clone);
    out.reviews = reviews.map(clone);
    // Popularity counts only: no person is identifiable from these
    out.enrollments = T.enrollments.filter(e => courseIds.has(e.courseId) && e.status !== 'cancelled').map(e => pick(e, ['id', 'courseId']));
    // Reviewers appear by name on course pages
    out.users = T.users.filter(u => reviewerIds.has(u.id)).map(u => pick(u, ['id', 'name', 'avatar', 'role']));
    return out;
}

function snapshot(engine, session) {
    const raw = engine.raw(), tables = engine.tables;
    const role = session && session.role, uid = session && session.userId;

    if (role === 'admin') {
        const out = {};
        for (const t of tables) out[t] = raw.tables[t].map(clone);
        out.users = raw.tables.users.map(u => ownUser(clone(u)));
        out.staff_applications = raw.tables.staff_applications.map(a => omit(clone(a), ['passwordHash']));
        return { tables: out, settings: settingsFor(raw, true) };
    }

    const out = publicTables(raw, tables);
    const me = uid && raw.tables.users.find(u => u.id === uid);
    if (me && role === 'student') {
        const mine = t => raw.tables[t].filter(r => r.userId === uid).map(clone);
        out.enrollments = raw.tables.enrollments.filter(e => e.userId === uid).map(clone);   // replaces the anonymous counts with their own full rows plus counts below
        const own = new Set(out.enrollments.map(e => e.id));
        for (const e of raw.tables.enrollments) if (e.userId !== uid && e.status !== 'cancelled' && !own.has(e.id)) out.enrollments.push(pick(e, ['id', 'courseId']));
        out.orders = mine('orders');
        const orderIds = new Set(out.orders.map(o => o.id));
        out.order_items = raw.tables.order_items.filter(i => orderIds.has(i.orderId)).map(clone);
        out.payments = raw.tables.payments.filter(p => orderIds.has(p.orderId)).map(clone);
        out.certificates = mine('certificates');
        out.lesson_progress = mine('lesson_progress');
    }
    if (me && (role === 'student' || role === 'staff')) {
        out.users = out.users.filter(u => u.id !== me.id).concat([ownUser(clone(me))]);
    }
    return { tables: out, settings: settingsFor(raw, false) };
}

// One certificate by its public code (for the verification page). Reveals only what a certificate itself states.
function certificateByCode(engine, code) {
    const c = engine.raw().tables.certificates.find(x => String(x.code || '').toUpperCase() === String(code || '').trim().toUpperCase());
    return c ? clone(c) : null;
}

module.exports = { snapshot, certificateByCode, ownUser, settingsFor, USER_SECRETS };
