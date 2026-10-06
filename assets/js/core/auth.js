// Accounts & sessions shared by every page.
// NOTE: this static build keeps accounts in the browser, so it is a working demo, not real security.
// For production, replace these functions with calls to your auth provider (e.g. Supabase Auth) and
// keep the same signatures so pages don't change.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const db = TOS.db;
    const SESSION_KEY = 'to_current_user';
    const ADMIN_KEY = 'tos_admin_session';
    const ADMIN_TTL = 8 * 3600000;

    // Session lives in localStorage when 'remember me' is ticked, otherwise only for this browser tab session.
    const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; } };
    function current() {
        const s = readSession(); if (!s) return null;
        const u = (s.id && db.get('users', s.id)) || db.first('users', x => x.email === String(s.email || '').toLowerCase());
        if (!u || u.status === 'suspended') return null;
        return { id: u.id, name: u.name, email: u.email, role: u.role, studentId: u.studentId || null };
    }
    // Why there is no session: 'none' | 'suspended' | 'deleted'
    function sessionProblem() {
        const s = readSession(); if (!s) return 'none';
        const u = s.id && db.get('users', s.id);
        return !u ? 'deleted' : u.status === 'suspended' ? 'suspended' : null;
    }
    function start(user, remember) {
        const data = JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role, ts: Date.now() });
        localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
        (remember === false ? sessionStorage : localStorage).setItem(SESSION_KEY, data);
        return current();
    }
    function logout() { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); }

    // Students may sign in with their email or their student ID
    function login(email, password, role, remember) {
        email = String(email || '').trim().toLowerCase();
        const u = db.first('users', x => x.email === email || (x.studentId && x.studentId.toLowerCase() === email));
        if (!u || u.password !== password) return { error: 'Incorrect email, student ID or password.' };
        if (u.status === 'suspended') return { error: 'This account is suspended. Please contact ' + db.settings().school.studentEmail + '.' };
        if (role && u.role !== role) return { error: u.role === 'staff' ? 'This is a staff account. Go back and choose "Staff / Instructor".' : 'This is a student account. Go back and choose "Student".' };
        db.update('users', u.id, { lastLoginAt: db.now() });
        return { user: start(u, remember) };
    }
    function changePassword(userId, currentPassword, newPassword) {
        const u = db.get('users', userId);
        if (!u || u.password !== currentPassword) return { error: 'Your current password is incorrect.' };
        if (String(newPassword).length < 8) return { error: 'Use at least 8 characters for your new password.' };
        db.update('users', userId, { password: newPassword, passwordChangedAt: db.now() });
        return { ok: true };
    }
    function register({ name, email, password }) {
        email = String(email || '').trim().toLowerCase();
        if (db.settings().portal && db.settings().portal.allowSelfRegistration === false) return { error: 'New accounts are created by the school. Please contact ' + db.settings().school.email + '.' };
        if (db.first('users', { email })) return { error: 'An account with this email already exists. Please log in.' };
        const u = db.insert('users', { role: 'student', name: (name || '').trim() || email.split('@')[0], email, password, lastLoginAt: db.now() });
        return { user: start(u) };
    }

    // ---- Admin (separate session, separate login page) ----
    const isAdmin = () => { try { const s = JSON.parse(localStorage.getItem(ADMIN_KEY)); return !!s && Date.now() - s.ts < ADMIN_TTL; } catch (e) { return false; } };
    function adminLogin(id, pass) {
        const st = db.settings().school;
        const okId = [String(st.adminEmail).toLowerCase(), 'admin'].includes(String(id).trim().toLowerCase());
        if (okId && pass === st.adminPasscode) { localStorage.setItem(ADMIN_KEY, JSON.stringify({ ts: Date.now() })); return true; }
        return false;
    }
    const adminLogout = () => localStorage.removeItem(ADMIN_KEY);

    // ---- One-time import of data saved by the previous (flat) version of the site ----
    TOS.migrateLegacy = function (db) {
        const st = db.settings(); if (st._legacyMigrated) return;
        st._legacyMigrated = true; // saved with the next write; re-running is harmless (it skips existing rows)
        let users = [], students = [];
        try { users = JSON.parse(localStorage.getItem('to_users')) || []; } catch (e) { }
        try { students = JSON.parse(localStorage.getItem('to_students')) || []; } catch (e) { }
        users.forEach(u => {
            const email = String(u.email || '').toLowerCase(); if (!email || db.first('users', { email })) return;
            db.insert('users', { role: u.role === 'staff' ? 'staff' : 'student', name: u.name || email.split('@')[0], email, password: u.password || '' });
        });
        students.forEach(s => {
            const email = String(s.email || '').toLowerCase(); if (!email) return;
            const user = db.first('users', { email }) || db.insert('users', { role: 'student', name: s.name || email, email, password: '' });
            const course = db.first('courses', c => c.title === s.course); if (!course || db.first('enrollments', { userId: user.id, courseId: course.id })) return;
            const paid = /^paid/i.test(s.status || '');
            const order = db.insert('orders', { userId: user.id, couponId: null, subtotal: 5, discount: 0, total: 5, currency: 'USD', status: paid ? 'paid' : 'pending', provider: 'manual', paidAt: paid ? db.now() : null });
            db.insert('order_items', { orderId: order.id, courseId: course.id, price: 5 });
            db.insert('enrollments', { userId: user.id, courseId: course.id, status: paid ? 'active' : 'trial', enrolledAt: new Date(new Date(s.trialEnd || Date.now()).getTime() - 7 * 86400000).toISOString(), trialEndsAt: s.trialEnd || null, orderId: order.id, currentLessonId: null, lastAccessAt: null, source: 'legacy' });
        });
    };

    TOS.auth = { current, sessionProblem, start, logout, login, register, changePassword, isAdmin, adminLogin, adminLogout };
})();
