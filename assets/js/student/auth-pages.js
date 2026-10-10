// Student sign-in pages: /student/login, /student/register, /student/forgot-password
(function () {
    const safeNext = n => n && n.startsWith('/') && !n.startsWith('//') ? n : '/student/dashboard';
    const layout = (title, sub, body) => `<main class="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
        <section class="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-forest via-forest-600 to-ink text-white p-12 flex-col justify-between grain">
            <div class="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-gold/15 blur-3xl"></div><div class="absolute -left-24 bottom-0 w-80 h-80 rounded-full bg-forest-400/20 blur-3xl"></div>
            <a href="/" class="relative" aria-label="Tech Oasis School website">${ui.brandLogo(true, 44)}</a>
            <div class="relative max-w-md">
                <span class="text-[11px] font-bold uppercase tracking-[0.25em] text-gold-200">Student Portal</span>
                <h2 class="font-display text-[44px] leading-[1.08] mt-4">Your learning, all in one place.</h2>
                <ul class="mt-8 space-y-4 text-white/85 text-[15px]">
                    <li class="flex gap-3"><span class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gold shrink-0"><i class="fa-solid fa-circle-play"></i></span><span>Pick up exactly where you left off, on any device</span></li>
                    <li class="flex gap-3"><span class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gold shrink-0"><i class="fa-solid fa-list-check"></i></span><span>Assignments, quizzes and deadlines in one calendar</span></li>
                    <li class="flex gap-3"><span class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gold shrink-0"><i class="fa-solid fa-award"></i></span><span>Verified certificates when you complete a program</span></li>
                </ul>
            </div>
            <p class="relative text-xs text-white/50">&copy; ${new Date().getFullYear()} Tech Oasis School · <a href="mailto:${esc(db.settings().school.studentEmail)}" class="underline">${esc(db.settings().school.studentEmail)}</a></p>
        </section>
        <section class="flex items-center justify-center p-6 sm:p-10">
            <div class="w-full max-w-[400px]">
                <a href="/" class="lg:hidden inline-block mb-10">${ui.brandLogo(false, 40)}</a>
                <h1 class="text-[28px] font-bold text-slate-900 tracking-tight">${title}</h1>
                <p class="text-sm s-muted mt-1.5">${sub}</p>
                ${ui.demoNotice()}
                <div class="mt-8">${body}</div>
            </div>
        </section></main>`;
    const notice = (kind, html) => `<div class="mb-5 rounded-xl px-4 py-3 text-sm ${kind === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-100' : kind === 'warn' ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'}" role="${kind === 'error' ? 'alert' : 'status'}">${html}</div>`;
    const pwField = (id, label, auto) => `<div><div class="flex items-center justify-between"><label class="field-label" for="${id}">${label}</label>${id === 'pw' ? '<a href="/student/forgot-password" class="text-xs font-semibold text-forest-600 hover:underline">Forgot password?</a>' : ''}</div>
        <div class="relative"><input id="${id}" type="password" required minlength="${id === 'pw' ? 1 : 8}" autocomplete="${auto}" class="field h-12 pr-11"><button type="button" data-eye="${id}" class="absolute right-1 top-1 w-10 h-10 rounded-lg text-slate-400 hover:text-slate-700" aria-label="Show password"><i class="fa-regular fa-eye"></i></button></div></div>`;
    const bindEyes = () => document.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => { const i = document.getElementById(b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; b.innerHTML = `<i class="fa-regular ${i.type === 'password' ? 'fa-eye' : 'fa-eye-slash'}"></i>`; b.setAttribute('aria-label', i.type === 'password' ? 'Show password' : 'Hide password'); });

    S.route('/student/login', { title: 'Student sign in', layout: 'auth', render: el => {
        const q = S.q;
        const msg = q('expired') ? notice('warn', '<i class="fa-solid fa-clock mr-1"></i>Your session has expired. Please sign in again.')
            : (q('suspended') || q('state')) ? notice('error', `<i class="fa-solid fa-ban mr-1"></i>This account is suspended. Contact <a class="underline" href="mailto:${esc(db.settings().school.studentEmail)}">${esc(db.settings().school.studentEmail)}</a>.`)
            : q('signedout') ? notice('ok', '<i class="fa-solid fa-circle-check mr-1"></i>You have been signed out.')
            : q('reset') ? notice('ok', '<i class="fa-solid fa-circle-check mr-1"></i>Your request was saved on this device. The school only sees it when it is connected to a server, so please also email ' + esc(db.settings().school.studentEmail) + ' to get your password reset.') : '';
        const allowReg = db.settings().portal.allowSelfRegistration !== false;
        el.innerHTML = layout('Welcome back', 'Sign in to your Tech Oasis student account.', `${msg}
            <form id="loginForm" class="space-y-5" novalidate>
                <div><label class="field-label" for="who">Email or student ID</label><input id="who" required autocomplete="username" class="field h-12" placeholder="you@email.com or TOS2026…"></div>
                ${pwField('pw', 'Password', 'current-password')}
                <label class="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer"><input id="remember" type="checkbox" checked class="w-4 h-4 rounded accent-[#0C3B2E]">Remember me on this device</label>
                <p id="err" class="hidden text-sm font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3" role="alert"></p>
                <button class="btn btn-forest w-full h-12 text-[15px]">Sign in</button>
            </form>
            <div class="mt-8 pt-6 border-t border-slate-100 text-sm text-slate-600 space-y-2">
                <p>Don't have an account? ${allowReg ? '<a href="/student/register" class="font-semibold text-forest-600 hover:underline">Create one</a> or ' : ''}contact the school at <a href="mailto:${esc(db.settings().school.email)}" class="font-semibold text-forest-600 hover:underline">${esc(db.settings().school.email)}</a>.</p>
                <p class="text-xs s-muted">Staff or instructor? <a href="/staff/login" class="underline">Sign in to the Staff Portal</a> · <a href="/staff/apply" class="underline">Apply to teach</a> · <a href="/" class="underline">Back to website</a></p>
            </div>`);
        bindEyes();
        document.getElementById('who').focus();
        document.getElementById('loginForm').onsubmit = e => {
            e.preventDefault();
            const err = document.getElementById('err'), who = document.getElementById('who').value.trim(), pw = document.getElementById('pw').value;
            if (!who || !pw) { err.textContent = 'Enter your email or student ID and your password.'; return err.classList.remove('hidden'); }
            const r = auth.login(who, pw, null, document.getElementById('remember').checked);
            if (r.error) { err.textContent = r.error; return err.classList.remove('hidden'); }
            if (r.user.role !== 'student') { auth.logout(); err.innerHTML = r.user.role === 'staff' ? 'This is a staff account. Use the <a class="underline" href="/staff/login">Staff Portal sign-in</a>.' : 'This account cannot sign in to the student portal.'; return err.classList.remove('hidden'); }
            S.me = null;
            const next = safeNext(q('next'));
            if (next.startsWith('/student')) S.go(next, { replace: true }); else location.href = next;
        };
    } });

    S.route('/student/register', { title: 'Create account', layout: 'auth', render: el => {
        if (db.settings().portal.allowSelfRegistration === false) { el.innerHTML = layout('Accounts are created by the school', 'Contact admissions to get your student account.', `<a href="mailto:${esc(db.settings().school.email)}" class="btn btn-forest w-full h-12">Email ${esc(db.settings().school.email)}</a><a href="/student/login" class="block text-center text-sm font-semibold text-forest-600 mt-4">Back to sign in</a>`); return; }
        el.innerHTML = layout('Create your student account', 'Join free, then enroll in any program.', `<form id="regForm" class="space-y-5">
            <div><label class="field-label" for="nm">Full name</label><input id="nm" required minlength="2" autocomplete="name" class="field h-12"></div>
            <div><label class="field-label" for="em">Email</label><input id="em" type="email" required autocomplete="email" class="field h-12"></div>
            ${pwField('pw1', 'Password', 'new-password')}
            <p class="field-hint -mt-3">At least 8 characters.</p>
            <p id="err" class="hidden text-sm font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3" role="alert"></p>
            <button class="btn btn-forest w-full h-12 text-[15px]">Create account</button>
            <p class="text-xs s-muted">By creating an account you accept the school's Terms of Use and Privacy Notice.</p></form>
            <p class="mt-8 pt-6 border-t border-slate-100 text-sm text-slate-600">Already have an account? <a href="/student/login" class="font-semibold text-forest-600 hover:underline">Sign in</a></p>`);
        bindEyes();
        document.getElementById('regForm').onsubmit = e => {
            e.preventDefault();
            const err = document.getElementById('err');
            const r = auth.register({ name: document.getElementById('nm').value, email: document.getElementById('em').value, password: document.getElementById('pw1').value });
            if (r.error) { err.textContent = r.error; return err.classList.remove('hidden'); }
            S.me = null; ui.toast('Welcome to Tech Oasis! Your student ID is ' + (r.user.studentId || ''));
            const next = safeNext(S.q('next'));
            if (next.startsWith('/student')) S.go(next, { replace: true }); else location.href = next;
        };
    } });

    S.route('/student/forgot-password', { title: 'Reset password', layout: 'auth', render: el => {
        el.innerHTML = layout('Reset your password', 'Enter your email or student ID to request a new password. If you need it urgently, email the school directly.', `<form id="fpForm" class="space-y-5">
            <div><label class="field-label" for="who">Email or student ID</label><input id="who" required class="field h-12"></div>
            <div><label class="field-label" for="note">Anything we should know? <span class="font-normal s-muted">(optional)</span></label><textarea id="note" rows="3" class="field" placeholder="e.g. best phone number to reach you"></textarea></div>
            <button class="btn btn-forest w-full h-12">Request password reset</button></form>
            <a href="/student/login" class="block text-center text-sm font-semibold text-forest-600 mt-6">Back to sign in</a>`);
        document.getElementById('fpForm').onsubmit = e => {
            e.preventDefault();
            const who = document.getElementById('who').value.trim().toLowerCase();
            const u = db.first('users', x => x.role === 'student' && (x.email === who || (x.studentId || '').toLowerCase() === who));
            // Same response whether or not the account exists, so emails can't be probed
            if (u) TOS.engage.openTicket(u.id, { category: 'account', subject: 'Password reset request', body: 'Password reset requested from the sign-in page.' + (document.getElementById('note').value ? '\n\nNote: ' + document.getElementById('note').value : '') });
            S.go('/student/login?reset=1', { replace: true });
        };
    } });
})();
