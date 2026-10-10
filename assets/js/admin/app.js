// Admin CMS shell: navigation, hash router, shared view helpers, charts and the dashboard.
// Each feature file registers routes with A.route(pattern, handler).
const { db, lms, ui, auth } = TOS;
const esc = ui.esc;

const A = window.A = {
    routes: [],
    route(pattern, fn) { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'); this.routes.push({ re, keys, fn, pattern }); },
    view: () => document.getElementById('view'),
    query: () => document.getElementById('globalSearch').value.trim().toLowerCase(),
    matches: (...parts) => { const q = A.query(); return !q || parts.join(' ').toLowerCase().includes(q); },
};

// ---------------- Navigation ----------------
A.NAV = [
    { items: [['dashboard', 'Dashboard', 'fa-gauge-high']] },
    { title: 'Learning Management', items: [['courses', 'Courses', 'fa-book-open'], ['categories', 'Categories', 'fa-folder-tree'], ['lessons', 'Lessons', 'fa-circle-play'], ['quizzes', 'Quizzes', 'fa-circle-question'], ['assignments', 'Assignments', 'fa-file-pen'], ['resources', 'Resources', 'fa-paperclip'], ['certificates', 'Certificates', 'fa-award']] },
    { title: 'People', items: [['students', 'Students', 'fa-user-graduate'], ['instructors', 'Instructors', 'fa-chalkboard-user'], ['enrollments', 'Enrollments', 'fa-id-card']] },
    { title: 'Commerce', items: [['payments', 'Payments', 'fa-credit-card'], ['orders', 'Orders', 'fa-receipt'], ['coupons', 'Coupons', 'fa-ticket']] },
    { title: 'Engagement', items: [['reviews', 'Reviews', 'fa-star'], ['discussions', 'Discussions', 'fa-comments'], ['announcements', 'Announcements', 'fa-bullhorn']] },
    { title: 'Analytics', items: [['analytics/courses', 'Course Analytics', 'fa-chart-column'], ['analytics/students', 'Student Analytics', 'fa-chart-line'], ['analytics/revenue', 'Revenue Analytics', 'fa-sack-dollar']] },
    { title: 'Settings', items: [['settings/school', 'School Settings', 'fa-school'], ['settings/courses', 'Course Settings', 'fa-sliders'], ['settings/certificates', 'Certificate Settings', 'fa-certificate'], ['settings/payments', 'Payment Settings', 'fa-wallet']] }
];
function badgeFor(key) {
    if (A.extraBadges && A.extraBadges[key]) return A.extraBadges[key]();
    if (key === 'assignments') return db.count('submissions', s => s.status !== 'graded');
    if (key === 'reviews') return 0;
    if (key === 'payments') return db.all('enrollments').filter(e => lms.paymentState(e) === 'overdue').length;
    return 0;
}
A.renderNav = function (path) {
    const active = A.NAV.flatMap(g => g.items).map(i => i[0]).filter(k => path === k || path.startsWith(k + '/')).sort((a, b) => b.length - a.length)[0];
    const navEl = document.getElementById('navList'), navTop = navEl.scrollTop;   // rebuilt on every page change, so keep the scroll position
    navEl.innerHTML = A.NAV.map(g => `<div class="mb-5">${g.title ? `<div class="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">${g.title}</div>` : ''}
        ${g.items.map(([k, label, ic]) => { const n = badgeFor(k), on = k === active; return `<a href="#/${k}" class="flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 ${on ? 'bg-gold text-ink font-semibold' : 'hover:bg-white/5'}" ${on ? 'aria-current="page"' : ''}>
            <i class="fa-solid ${ic} w-4 ${on ? '' : 'text-white/40'}"></i><span class="flex-1">${label}</span>${n ? `<span class="min-w-[20px] h-5 px-1.5 rounded-full ${on ? 'bg-ink text-white' : 'bg-rose-600 text-white'} text-[10px] font-bold flex items-center justify-center">${n}</span>` : ''}</a>`; }).join('')}</div>`).join('');
    navEl.scrollTop = navTop;
    const cur = navEl.querySelector('[aria-current="page"]');   // keep the active item in view without jumping the menu
    if (cur) { const nr = navEl.getBoundingClientRect(), cr = cur.getBoundingClientRect(); if (cr.bottom > nr.bottom - 8) navEl.scrollTop += cr.bottom - nr.bottom + 8; else if (cr.top < nr.top + 8) navEl.scrollTop -= nr.top + 8 - cr.top; }
    const pending = badgeFor('assignments') + badgeFor('payments') + badgeFor('messages') + badgeFor('support'), bell = document.getElementById('bell');
    bell.textContent = pending; bell.classList.toggle('hidden', !pending);
};

// ---------------- Router ----------------
let currentRoute = null;
A.navigate = path => { location.hash = '#/' + path; };
A.refresh = () => A.dispatch(true);
A.dispatch = function (keepScroll) {
    if (!auth.isAdmin()) return A.showLogin();
    const path = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
    const params = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    if (currentRoute !== path) { document.getElementById('globalSearch').value = ''; if (!keepScroll) window.scrollTo(0, 0); }
    currentRoute = path;
    A.renderNav(path);
    document.getElementById('nav').classList.add('-translate-x-full'); document.getElementById('navScrim').classList.add('hidden');
    for (const r of A.routes) {
        const m = path.match(r.re);
        if (m) { const args = {}; r.keys.forEach((k, i) => args[k] = decodeURIComponent(m[i + 1])); try { r.fn(args, params); } catch (e) { console.error(e); A.view().innerHTML = A.empty('fa-triangle-exclamation', 'Something went wrong', e.message); } return; }
    }
    A.view().innerHTML = A.empty('fa-compass', 'Page not found', 'That section does not exist.', '<a href="#/dashboard" class="btn btn-forest btn-sm">Go to dashboard</a>');
};
A.crumbs = (...parts) => {
    document.getElementById('crumbs').innerHTML = parts.map((p, i) => Array.isArray(p) ? `<a href="#/${p[1]}" class="hover:text-ink truncate">${esc(p[0])}</a><i class="fa-solid fa-chevron-right text-[9px] text-slate-300"></i>` : `<span class="font-semibold text-ink truncate">${esc(p)}</span>`).join('');
    document.title = (parts[parts.length - 1] || 'Admin') + ' | Tech Oasis CMS';
};

// ---------------- View helpers ----------------
A.header = (title, sub, actions) => `<div class="flex flex-wrap items-end justify-between gap-4 mb-6"><div class="min-w-0"><h1 class="font-display text-3xl text-ink">${title}</h1>${sub ? `<p class="text-sm text-slate-500 mt-1">${sub}</p>` : ''}</div><div class="flex flex-wrap gap-2">${actions || ''}</div></div>`;
A.card = (body, cls) => `<div class="bg-white rounded-2xl border border-slate-200/80 ${cls || 'p-5'}">${body}</div>`;
A.cardTitle = (t, right) => `<div class="flex items-center justify-between gap-3 mb-4"><h2 class="font-semibold text-ink">${t}</h2>${right || ''}</div>`;
A.empty = (icon, title, text, action) => `<div class="text-center py-14 px-6"><span class="w-14 h-14 mx-auto rounded-2xl bg-forest-50 text-forest flex items-center justify-center text-xl"><i class="fa-solid ${icon}"></i></span><div class="font-semibold text-ink mt-4">${title}</div>${text ? `<p class="text-sm text-slate-500 mt-1 max-w-sm mx-auto">${text}</p>` : ''}${action ? `<div class="mt-5">${action}</div>` : ''}</div>`;
A.stat = (icon, tone, label, value, sub) => `<div class="bg-white rounded-2xl border border-slate-200/80 p-5"><div class="flex items-center justify-between"><span class="text-sm text-slate-500">${label}</span><span class="w-9 h-9 rounded-xl ${tone} flex items-center justify-center text-sm"><i class="fa-solid ${icon}"></i></span></div><div class="font-display text-3xl text-ink mt-2">${value}</div>${sub ? `<div class="text-xs text-slate-500 mt-1">${sub}</div>` : ''}</div>`;
A.pill = s => `<span class="pill pill-${esc(String(s).toLowerCase())}">${esc(String(s).replace(/_/g, ' '))}</span>`;
A.avatar = (name, tone) => `<span class="w-9 h-9 rounded-full ${tone || 'bg-forest-50 text-forest'} text-[11px] font-bold flex items-center justify-center shrink-0">${esc(ui.initials(name))}</span>`;
A.person = (name, sub) => `<div class="flex items-center gap-3 min-w-0">${A.avatar(name)}<div class="min-w-0"><div class="font-medium text-ink truncate">${esc(name)}</div>${sub ? `<div class="text-xs text-slate-500 truncate">${esc(sub)}</div>` : ''}</div></div>`;
A.progressBar = (pct, w) => `<div class="flex items-center gap-2 ${w || 'w-36'}"><div class="flex-1 h-1.5 bg-slate-100 rounded-full"><div class="h-1.5 rounded-full bg-forest-600" style="width:${pct}%"></div></div><span class="text-xs text-slate-500 w-9 text-right">${pct}%</span></div>`;
A.iconBtn = (icon, label, attrs, danger) => `<button ${attrs} class="w-8 h-8 rounded-lg ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-500 hover:bg-slate-100 hover:text-ink'}" title="${label}" aria-label="${label}"><i class="fa-solid ${icon} text-xs"></i></button>`;

// Data table: cols = [{ label, render(row), cls }]
A.table = (cols, rows, emptyHtml) => rows.length ? `<div class="overflow-x-auto -mx-5 sm:mx-0"><table class="w-full text-sm"><thead><tr class="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">${cols.map(c => `<th class="py-3 px-4 font-semibold whitespace-nowrap ${c.cls || ''}">${c.label}</th>`).join('')}</tr></thead>
    <tbody class="divide-y divide-slate-100">${rows.map(r => `<tr class="hover:bg-slate-50/60">${cols.map(c => `<td class="py-3 px-4 align-middle ${c.cls || ''}">${c.render(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : (emptyHtml || A.empty('fa-inbox', 'Nothing here yet'));

// Form helpers
A.field = (label, control, hint, cls) => `<div class="${cls || ''}"><label class="field-label">${label}</label>${control}${hint ? `<p class="field-hint">${hint}</p>` : ''}</div>`;
A.input = (name, value, attrs) => `<input name="${name}" value="${esc(value == null ? '' : value)}" class="field" ${attrs || ''}>`;
A.textarea = (name, value, rows, attrs) => `<textarea name="${name}" rows="${rows || 4}" class="field" ${attrs || ''}>${esc(value || '')}</textarea>`;
A.select = (name, options, value, attrs) => `<select name="${name}" class="field" ${attrs || ''}>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value == null ? '' : value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
A.toggle = (name, checked, label, hint) => `<label class="flex items-start gap-3 cursor-pointer"><span class="switch mt-0.5"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span></span></span><span><span class="block text-sm font-medium text-ink">${label}</span>${hint ? `<span class="block text-xs text-slate-500">${hint}</span>` : ''}</span></label>`;
// Read a form into an object: checkboxes -> booleans, type=number -> numbers, data-list -> array of lines
A.formData = form => {
    const o = {};
    Array.from(form.elements).forEach(el => {
        if (!el.name || el.disabled) return;
        if (el.type === 'checkbox') o[el.name] = el.checked;
        else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
        else if (el.type === 'number') o[el.name] = el.value === '' ? null : +el.value;
        else if (el.type === 'file') return;
        else if (el.dataset.list !== undefined) o[el.name] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
        else o[el.name] = el.value.trim();
    });
    return o;
};
// Small uploads are stored inline (demo storage adapter). Production: swap for your storage provider.
A.MAX_INLINE = 1048576;
A.upload = async file => {
    if (!file) return null;
    if (file.size > A.MAX_INLINE) { ui.toast(`"${file.name}" is larger than 1 MB. Host it (e.g. cloud storage) and paste the link instead.`, 'error'); return null; }
    return { url: await ui.readFile(file), name: file.name, size: file.size, type: file.type };
};
A.fileType = name => { const ext = (String(name).split('.').pop() || '').toLowerCase(); return ext === 'pdf' ? 'pdf' : ['zip', 'rar', '7z'].includes(ext) ? 'zip' : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? 'image' : ['js', 'ts', 'html', 'css', 'py', 'json', 'java', 'sql'].includes(ext) ? 'code' : ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext) ? 'doc' : 'file'; };
A.csv = (filename, rows) => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
};
A.courseOptions = (withAll) => (withAll ? [['', withAll]] : []).concat(db.all('courses').sort((a, b) => a.title.localeCompare(b.title)).map(c => [c.id, c.title]));
A.userName = id => (db.get('users', id) || {}).name || 'Deleted user';
A.courseTitle = id => (db.get('courses', id) || {}).title || '—';
A.bindSearch = fn => { const el = document.getElementById('globalSearch'); el.oninput = fn; };

// ---------------- Charts (single series, brand hue, hover tooltips) ----------------
// Vertical bars. data: [{ label, value, tip }]
A.barChart = (data, opts) => {
    opts = opts || {};
    if (!data.length || data.every(d => !d.value)) return `<div class="h-48 flex items-center justify-center text-sm text-slate-400">${opts.empty || 'No data yet'}</div>`;
    const max = Math.max(...data.map(d => d.value)), h = opts.height || 180;
    const ticks = [0, .5, 1].map(f => Math.round(max * f));
    return `<div class="relative" style="height:${h + 28}px">
        ${ticks.map(t => `<div class="absolute left-0 right-0 border-t border-dashed border-slate-200" style="bottom:${28 + (max ? t / max : 0) * h}px"><span class="absolute -top-2 left-0 text-[10px] text-slate-400 bg-white pr-1">${opts.fmt ? opts.fmt(t) : t}</span></div>`).join('')}
        <div class="absolute left-8 right-0 bottom-0 top-0 flex items-end gap-[2px]">${data.map(d => `<div class="flex-1 h-full flex flex-col justify-end items-center group cursor-default" data-tip="${esc(d.tip || d.label + ': ' + (opts.fmt ? opts.fmt(d.value) : d.value))}">
            <div class="w-full max-w-[36px] rounded-t bg-forest-600 group-hover:bg-gold transition-colors" style="height:${Math.max(d.value ? 3 : 0, d.value / max * h)}px"></div>
            <div class="h-7 pt-1.5 text-[10px] text-slate-500 truncate w-full text-center">${esc(d.short || d.label)}</div></div>`).join('')}</div></div>`;
};
// Line/area over time. data: [{ label, value }]
A.lineChart = (data, opts) => {
    opts = opts || {};
    if (!data.length || data.every(d => !d.value)) return `<div class="h-48 flex items-center justify-center text-sm text-slate-400">${opts.empty || 'No data yet'}</div>`;
    const W = 600, H = 180, P = 8, max = Math.max(1, ...data.map(d => d.value));
    const pts = data.map((d, i) => [P + i * (W - 2 * P) / Math.max(1, data.length - 1), H - P - d.value / max * (H - 2 * P)]);
    const line = pts.map(p => p.join(',')).join(' ');
    const id = 'lc' + Math.random().toString(36).slice(2, 7);
    return `<div class="relative" data-line="${id}"><svg viewBox="0 0 ${W} ${H}" class="w-full h-48" preserveAspectRatio="none">
        <defs><linearGradient id="${id}g" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#14584A" stop-opacity=".22"/><stop offset="100%" stop-color="#14584A" stop-opacity="0"/></linearGradient></defs>
        ${[.25, .5, .75].map(f => `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" stroke="#E2E8F0" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>`).join('')}
        <polygon points="${P},${H - P} ${line} ${W - P},${H - P}" fill="url(#${id}g)"/>
        <polyline points="${line}" fill="none" stroke="#14584A" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
        <line class="xh" x1="0" x2="0" y1="0" y2="${H}" stroke="#C4A649" stroke-width="1" vector-effect="non-scaling-stroke" style="display:none"/></svg>
        <div class="flex justify-between text-[10px] text-slate-400 mt-1"><span>${esc(data[0].label)}</span><span>${esc(data[Math.floor(data.length / 2)].label)}</span><span>${esc(data[data.length - 1].label)}</span></div>
        <script type="application/json">${JSON.stringify(data.map((d, i) => ({ x: pts[i][0] / W, l: d.label, v: opts.fmt ? opts.fmt(d.value) : d.value }))).replace(/</g, '\\u003c')}</script></div>`;
};
// Hover wiring for both chart types (event delegation)
document.addEventListener('mousemove', e => {
    const bar = e.target.closest && e.target.closest('[data-tip]');
    if (bar) return ui.chartTip(e, esc(bar.dataset.tip));
    const lc = e.target.closest && e.target.closest('[data-line]');
    if (lc) {
        const svg = lc.querySelector('svg'), r = svg.getBoundingClientRect(), pts = JSON.parse(lc.querySelector('script').textContent);
        const fx = (e.clientX - r.left) / r.width, p = pts.reduce((a, b) => Math.abs(b.x - fx) < Math.abs(a.x - fx) ? b : a);
        const xh = svg.querySelector('.xh'); xh.style.display = ''; xh.setAttribute('x1', p.x * 600); xh.setAttribute('x2', p.x * 600);
        return ui.chartTip(e, `<b>${esc(p.l)}</b> · ${esc(p.v)}`);
    }
    ui.chartTip(e, null);
    document.querySelectorAll('[data-line] .xh').forEach(x => x.style.display = 'none');
});
// Daily buckets for the last n days
A.daily = (rows, dateKey, n, valueFn) => {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
        const next = new Date(d); next.setDate(d.getDate() + 1);
        const inDay = rows.filter(r => r[dateKey] && new Date(r[dateKey]) >= d && new Date(r[dateKey]) < next);
        out.push({ label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: valueFn ? inDay.reduce((a, r) => a + valueFn(r), 0) : inDay.length });
    }
    return out;
};
A.revenueOf = orders => orders.filter(o => o.status === 'paid').reduce((a, o) => a + (+o.total || 0), 0);

// ---------------- Dashboard ----------------
A.route('dashboard', () => {
    A.crumbs('Dashboard');
    const courses = db.all('courses'), enrs = db.all('enrollments'), students = db.where('users', { role: 'student' });
    const published = courses.filter(c => c.status === 'published').length;
    const revenue = A.revenueOf(db.all('orders'));
    const completed = enrs.filter(e => e.status === 'completed').length;
    const toGrade = db.where('submissions', s => s.status !== 'graded');
    const overdue = enrs.filter(e => lms.paymentState(e) === 'overdue');
    const active7 = new Set(enrs.filter(e => e.lastAccessAt && Date.now() - new Date(e.lastAccessAt) < 7 * 864e5).map(e => e.userId)).size;
    const popular = courses.map(c => ({ c, n: enrs.filter(e => e.courseId === c.id).length })).sort((a, b) => b.n - a.n).slice(0, 5);
    const school = db.settings().school;
    A.view().innerHTML = `
        <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1 class="font-display text-3xl text-ink mt-1">Welcome back</h1><p class="text-sm text-slate-500 mt-1">Here's what's happening at ${esc(school.name)}.</p></div>
            <div class="flex gap-2"><a href="#/courses/new" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Create course</a><a href="index.html" target="_blank" class="btn btn-outline btn-sm">View site</a></div>
        </div>
        <div class="grid grid-cols-2 xl:grid-cols-6 gap-4">
            ${A.stat('fa-user-graduate', 'bg-sky-50 text-sky-700', 'Students', students.length, `${active7} active this week`)}
            ${A.stat('fa-book-open', 'bg-forest-50 text-forest', 'Courses', courses.length, `${published} published · ${courses.filter(c => c.status === 'draft').length} draft`)}
            ${A.stat('fa-id-card', 'bg-violet-50 text-violet-700', 'Enrollments', enrs.length, `${enrs.filter(e => lms.paymentState(e) === 'trial').length} on free trial`)}
            ${A.stat('fa-flag-checkered', 'bg-gold-50 text-gold-700', 'Completion rate', (enrs.length ? Math.round(completed / enrs.length * 100) : 0) + '%', `${completed} completed`)}
            ${A.stat('fa-award', 'bg-amber-50 text-amber-700', 'Certificates', db.count('certificates', c => !c.revoked), 'issued')}
            ${A.stat('fa-sack-dollar', 'bg-emerald-50 text-emerald-700', 'Revenue', ui.money(revenue), `${db.count('orders', { status: 'pending' })} orders pending`)}
        </div>
        <div class="grid xl:grid-cols-3 gap-5 mt-5">
            <div class="xl:col-span-2">${A.card(A.cardTitle('New enrollments', '<span class="text-xs text-slate-500">Last 30 days</span>') + A.lineChart(A.daily(enrs, 'enrolledAt', 30), { empty: 'No enrollments in the last 30 days' }))}</div>
            ${A.card(A.cardTitle('Quick actions') + `<div class="grid grid-cols-2 gap-2 text-sm">${[['#/courses/new', 'fa-plus', 'New course', 'bg-forest-50 text-forest'], ['#/assignments', 'fa-file-pen', 'Grade work', 'bg-gold-50 text-gold-700'], ['#/students', 'fa-user-plus', 'Add student', 'bg-sky-50 text-sky-700'], ['#/instructors', 'fa-chalkboard-user', 'Add instructor', 'bg-violet-50 text-violet-700'], ['#/announcements', 'fa-bullhorn', 'Announce', 'bg-rose-50 text-rose-700'], ['#/coupons', 'fa-ticket', 'New coupon', 'bg-amber-50 text-amber-700']].map(([h, ic, l, t]) => `<a href="${h}" class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-100 hover:border-forest-200 hover:bg-forest-50/40"><span class="w-8 h-8 rounded-lg ${t} flex items-center justify-center text-xs"><i class="fa-solid ${ic}"></i></span>${l}</a>`).join('')}</div>`)}
        </div>
        <div class="grid xl:grid-cols-3 gap-5 mt-5">
            ${A.card(A.cardTitle('Needs attention') + (toGrade.length || overdue.length ? `<div class="space-y-3">
                ${toGrade.slice(0, 4).map(s => { const a = db.get('assignments', s.assignmentId); return `<a href="#/assignments?grade=${s.id}" class="flex items-center gap-3 group">${A.avatar(A.userName(s.userId), 'bg-gold-50 text-gold-700')}<div class="min-w-0 flex-1"><div class="text-sm font-medium text-ink truncate group-hover:underline">${esc(A.userName(s.userId))} submitted work</div><div class="text-xs text-slate-500 truncate">${esc(a ? a.title : '')} · ${ui.timeAgo(s.submittedAt)}</div></div><span class="pill pill-submitted">Grade</span></a>`; }).join('')}
                ${overdue.slice(0, 3).map(e => `<a href="#/enrollments?q=${encodeURIComponent(A.userName(e.userId))}" class="flex items-center gap-3 group">${A.avatar(A.userName(e.userId), 'bg-rose-50 text-rose-700')}<div class="min-w-0 flex-1"><div class="text-sm font-medium text-ink truncate group-hover:underline">${esc(A.userName(e.userId))}'s trial ended unpaid</div><div class="text-xs text-slate-500 truncate">${esc(A.courseTitle(e.courseId))}</div></div><span class="pill pill-overdue">Follow up</span></a>`).join('')}</div>` : A.empty('fa-mug-hot', 'All caught up', 'Nothing needs your attention right now.')))}
            ${A.card(A.cardTitle('Most popular courses', '<a href="#/analytics/courses" class="text-xs font-semibold text-forest">Analytics</a>') + `<div class="space-y-3">${popular.map(({ c, n }) => `<a href="#/courses/${c.id}" class="flex items-center gap-3 group"><img src="${esc(c.thumbnail)}" alt="" class="w-12 h-9 rounded-lg object-cover bg-slate-100"><div class="flex-1 min-w-0"><div class="text-sm font-medium text-ink truncate group-hover:underline">${esc(c.title)}</div><div class="h-1.5 bg-slate-100 rounded-full mt-1.5"><div class="h-1.5 rounded-full bg-forest-600" style="width:${popular[0].n ? n / popular[0].n * 100 : 0}%"></div></div></div><span class="text-sm font-semibold text-ink w-8 text-right">${n}</span></a>`).join('')}</div>`)}
            ${A.card(A.cardTitle('Recent enrollments', '<a href="#/enrollments" class="text-xs font-semibold text-forest">View all</a>') + `<div class="space-y-3">${enrs.slice().sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt)).slice(0, 6).map(e => `<div class="flex items-center gap-3">${A.avatar(A.userName(e.userId))}<div class="min-w-0 flex-1"><div class="text-sm font-medium text-ink truncate">${esc(A.userName(e.userId))}</div><div class="text-xs text-slate-500 truncate">${esc(A.courseTitle(e.courseId))}</div></div><span class="text-xs text-slate-400 whitespace-nowrap">${ui.timeAgo(e.enrolledAt)}</span></div>`).join('') || '<p class="text-sm text-slate-500">No enrollments yet.</p>'}</div>`)}
        </div>`;
});

// ---------------- Boot ----------------
A.showLogin = () => {
    document.getElementById('shell').classList.add('hidden'); document.getElementById('login').classList.remove('hidden');
    // Role-based access: a signed-in student (or instructor) is told plainly that the CMS is off-limits
    const s = auth.current(), form = document.getElementById('loginForm');
    if (s && s.role !== 'admin' && !document.getElementById('roleDenied')) {
        form.insertAdjacentHTML('afterbegin', `<div id="roleDenied" class="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm p-4" role="alert"><b>Access denied.</b> You are signed in as a ${s.role === 'student' ? 'student' : 'staff member'}, and ${s.role === 'student' ? 'student accounts' : 'staff accounts'} cannot access the admin CMS. <a href="${s.role === 'student' ? '/student/dashboard' : '/staff/dashboard'}" class="underline font-semibold">Go to your ${s.role === 'student' ? 'student portal' : 'Staff Portal'}</a></div>`);
    }
    setTimeout(() => document.getElementById('adminId').focus(), 30);
};
A.start = function () {
    ui.applyBrandLogos();
    let fails = 0, lockUntil = 0;
    document.getElementById('loginForm').onsubmit = e => {
        e.preventDefault();
        const err = document.getElementById('loginErr');
        if (Date.now() < lockUntil) { err.textContent = `Too many attempts. Try again in ${Math.ceil((lockUntil - Date.now()) / 1000)}s.`; return err.classList.remove('hidden'); }
        if (auth.adminLogin(document.getElementById('adminId').value, document.getElementById('adminPass').value)) {
            fails = 0; err.classList.add('hidden'); document.getElementById('adminPass').value = '';
            document.getElementById('login').classList.add('hidden'); document.getElementById('shell').classList.remove('hidden');
            return A.dispatch();
        }
        if (++fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
        err.textContent = 'Invalid admin email or passcode.'; err.classList.remove('hidden');
    };
    document.getElementById('logoutBtn').onclick = () => { auth.adminLogout(); A.showLogin(); };
    document.getElementById('navToggle').onclick = () => { document.getElementById('nav').classList.remove('-translate-x-full'); document.getElementById('navScrim').classList.remove('hidden'); };
    document.getElementById('navScrim').onclick = () => { document.getElementById('nav').classList.add('-translate-x-full'); document.getElementById('navScrim').classList.add('hidden'); };
    document.getElementById('adminEmailLabel').textContent = db.settings().school.adminEmail;
    window.addEventListener('hashchange', () => A.dispatch());
    if (auth.isAdmin()) { document.getElementById('shell').classList.remove('hidden'); A.dispatch(); } else A.showLogin();
};
