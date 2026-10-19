// Replaces the browser-side sign-in, student API, staff API and the public staff-application functions with calls to the
// school server (see remote.js). Loaded after the other core scripts, and only active when remote.js turned the server on.
// Every function keeps its name and result shape, so the pages work as before, except that results now arrive asynchronously
// (pages `await` them, which also works for the plain demo where results are immediate).
(function () {
    const TOS = window.TOS, R = TOS && TOS.remote;
    if (!R) return;
    const { auth, api, staffApi, staff: ST } = TOS;

    // ---------- who is signed in ----------
    if (auth) {
        Object.assign(auth, {
            current: () => R.me ? Object.assign({}, R.me) : null,
            sessionProblem: () => R.me ? null : (R.problem || 'none'),
            isAdmin: () => !!R.me && R.me.role === 'admin',
            async login(email, password, role, remember) {
                const j = await R.post('/api/auth/login', { email, password, role, remember });
                if (!j.user) return { error: j.error || 'Incorrect email, student ID or password.', status: j.status };
                await R.setUser(j.user);
                return { user: j.user };
            },
            async register(d) {
                const j = await R.post('/api/auth/register', { name: d.name, email: d.email, password: d.password });
                if (!j.user) return { error: j.error || 'Could not create the account.' };
                await R.setUser(j.user);
                return { user: j.user };
            },
            logout() {
                R.me = null; R.problem = 'none';
                const done = R.post('/api/auth/logout', {}, { keepalive: true }).catch(() => { });
                return done.then(() => R.refresh().catch(() => { })).then(() => R.handlers.session.forEach(f => f()));
            },
            async adminLogin(id, pass) {
                const j = await R.post('/api/auth/admin-login', { id, pass });
                if (!j.ok) return false;
                await R.setUser(j.user);
                return true;
            },
            adminLogout() { return auth.logout(); },
            setAdminPasscode(pass) {
                return R.post('/api/auth/admin-password', { password: pass }).catch(e => { TOS.ui.toast(e.message, 'error'); throw e; });
            }
        });
    }

    // ---------- the student and staff portals: the server runs the site's own API as the signed-in person ----------
    const proxy = (target, ns) => {
        if (!target) return;
        Object.keys(target).forEach(k => {
            if (k === 'ApiError' || typeof target[k] !== 'function') return;
            target[k] = (...args) => R.rpc(ns, k, args);
        });
    };
    proxy(api, 'student');
    proxy(staffApi, 'staff');

    // ---------- staff sign-in and teaching applications (public) ----------
    if (ST) {
        Object.assign(ST, {
            async staffLogin(email, password, remember) {
                const j = await R.post('/api/auth/staff-login', { email, password, remember });
                if (!j.user) return { error: j.error, status: j.status, application: j.application };
                await R.setUser(j.user);
                return { user: j.user, mustChangePassword: !!j.mustChangePassword };
            },
            applyBlock: email => R.rpc('public', 'applyBlock', [email]),
            async submitApplication(d) { const r = await R.rpc('public', 'apply', [d]); return { id: r.id, email: d.email }; },
            verifyEmail: token => R.rpc('public', 'verifyEmail', [token]),
            // The server answers with the applicant's own view (never admin notes), or nothing for wrong credentials
            applicationByCredentials: (email, password) => R.rpc('public', 'status', [email, password]).catch(e => { if (e.code === 'AUTH') return null; throw e; }),
            applicantView: a => a,
            withdraw: (email, password) => R.rpc('public', 'withdraw', [email, password]),
            applicantReply: (email, password, body, documents) => R.rpc('public', 'reply', [email, password, body, documents]),
            requestPasswordReset: email => R.rpc('public', 'forgot', [email]),
            resetPasswordWithToken: (token, password) => R.rpc('public', 'reset', [token, password])
        });
    }
})();
