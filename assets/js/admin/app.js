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
    document.getElementById('navList').innerHTML = A.NAV.map(g => `<div class="mb-5">${g.title ? `<div class="rail-group px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35" style="--rail-x:6px"><span class="rail-fade">${g.title}</span></div>` : ''}
        ${g.items.map(([k, label, ic]) => { const n = badgeFor(k), on = k === active; return `<a href="#/${k}" class="relative flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 ${on ? 'bg-gold text-ink font-semibold' : 'hover:bg-white/5'}" ${on ? 'aria-current="page"' : ''}>
            <i class="fa-solid ${ic} w-4 ${on ? '' : 'text-white/40'}"></i><span class="flex-1 rail-fade">${label}</span>${n ? `<span class="rail-badge min-w-[20px] h-5 px-1.5 rounded-full ${on ? 'bg-ink text-white' : 'bg-rose-600 text-white'} text-[10px] font-bold flex items-center justify-center">${n}</span>` : ''}</a>`; }).join('')}</div>`).join('');
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
    // opts.minMax keeps tiny counts (e.g. one enrollment a day) from filling the whole chart height
    const max = Math.max(opts.minMax || 0, ...data.map(d => d.value)), h = opts.height || 180;
    const ticks = [...new Set([0, .5, 1].map(f => Math.round(max * f)))];
    return `<div class="relative" style="height:${h + 28}px">
        ${ticks.map(t => `<div class="absolute left-0 right-0 border-t border-dashed border-slate-200" style="bottom:${28 + (max ? t / max : 0) * h}px"><span class="absolute -top-2 left-0 text-[10px] text-slate-400 bg-white pr-1">${opts.fmt ? opts.fmt(t) : t}</span></div>`).join('')}
        <div class="absolute left-8 right-0 bottom-0 top-0 flex items-end gap-[2px]">${data.map(d => `<div class="flex-1 min-w-0 h-full flex flex-col justify-end items-center group cursor-default" data-tip="${esc(d.tip || d.label + ': ' + (opts.fmt ? opts.fmt(d.value) : d.value))}">
            <div class="w-full max-w-[36px] rounded-t bg-forest-600 group-hover:bg-gold transition-colors" style="height:${Math.max(d.value ? 3 : 0, d.value / max * h)}px"></div>
            <div class="h-7 pt-1.5 text-[10px] text-slate-500 whitespace-nowrap w-full flex justify-center">${esc(d.short == null ? d.label : d.short)}</div></div>`).join('')}</div></div>`;
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
    const active7 = new Set(enrs.filter(e => e.lastAccessAt && Date.now() - new Date(e.lastAccessAt) < 7 * 864e5).map(e => e.userId)).size;
    const popular = courses.map(c => ({ c, n: enrs.filter(e => e.courseId === c.id).length })).sort((a, b) => b.n - a.n).slice(0, 5);
    const school = db.settings().school;

    // Enrollment trend: last 30 days against the 30 days before
    const series = A.daily(enrs, 'enrolledAt', 30).map((d, i, all) => ({ ...d, short: i % 5 === 0 || i === all.length - 1 ? d.label : '' }));
    const last30 = series.reduce((a, d) => a + d.value, 0);
    const prev30 = enrs.filter(e => { const age = Date.now() - new Date(e.enrolledAt); return age >= 30 * 864e5 && age < 60 * 864e5; }).length;
    // Absolute change reads honestly on small numbers (a % jump from 1 to 11 looks dramatic but means little)
    const delta = last30 - prev30;
    const trend = `<span class="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full ${delta > 0 ? 'bg-emerald-50 text-emerald-700' : delta < 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}"><i class="fa-solid ${delta > 0 ? 'fa-arrow-trend-up' : delta < 0 ? 'fa-arrow-trend-down' : 'fa-minus'} text-[10px]"></i>${delta > 0 ? '+' : ''}${delta} vs previous 30 days</span>`;

    // One compact metrics strip instead of six large cards
    const kpi = (icon, tone, label, value, sub, href) => `<a href="${href}" class="group bg-white p-4 sm:p-5 hover:bg-slate-50 transition-colors min-w-0">
        <div class="flex items-center gap-2 text-xs font-medium text-slate-500"><span class="w-6 h-6 rounded-md ${tone} flex items-center justify-center text-[11px]"><i class="fa-solid ${icon}"></i></span><span class="truncate">${label}</span></div>
        <div class="font-display text-[26px] leading-none text-ink mt-3">${value}</div>
        <div class="text-xs text-slate-500 mt-1.5 truncate">${sub}</div></a>`;

    // Work queue: every item is always listed so the admin sees at a glance what is clear and what is waiting
    const tasks = [
        ['#/assignments', 'fa-file-pen', 'bg-gold-50 text-gold-700', 'Submissions to grade', 'Assignments waiting for feedback', badgeFor('assignments')],
        ['#/staff-applications', 'fa-file-signature', 'bg-violet-50 text-violet-700', 'Staff applications', 'Pending or under review', badgeFor('staff-applications')],
        ['#/payments', 'fa-hourglass-end', 'bg-rose-50 text-rose-700', 'Unpaid after free trial', 'Students to follow up', badgeFor('payments')],
        ['#/messages', 'fa-envelope', 'bg-sky-50 text-sky-700', 'Unread messages', 'From students to the school', badgeFor('messages')],
        ['#/support', 'fa-life-ring', 'bg-emerald-50 text-emerald-700', 'Open support tickets', 'Questions from learners', badgeFor('support')]
    ];
    const open = tasks.reduce((a, t) => a + t[5], 0);

    const actions = [['#/courses/new', 'fa-plus', 'New course'], ['#/assignments', 'fa-file-pen', 'Grade work'], ['#/students', 'fa-user-plus', 'Add student'],
        ['#/staff-applications', 'fa-user-tie', 'Review staff'], ['#/announcements', 'fa-bullhorn', 'Announce'], ['#/coupons', 'fa-ticket', 'New coupon']];

    A.view().innerHTML = `
        <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div class="min-w-0"><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1 class="font-display text-3xl text-ink mt-1">Welcome back</h1><p class="text-sm text-slate-500 mt-1">Here's what's happening at ${esc(school.name)}.</p></div>
            <div class="flex gap-2"><a href="index.html" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>View site</a><a href="#/courses/new" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Create course</a></div>
        </div>

        <section aria-label="Key figures" class="rounded-2xl border border-slate-200/80 overflow-hidden grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-px bg-slate-200/70">
            ${kpi('fa-user-graduate', 'bg-sky-50 text-sky-700', 'Students', students.length, `${active7} active this week`, '#/students')}
            ${kpi('fa-book-open', 'bg-forest-50 text-forest', 'Courses', courses.length, `${published} published · ${courses.length - published} draft`, '#/courses')}
            ${kpi('fa-id-card', 'bg-violet-50 text-violet-700', 'Enrollments', enrs.length, `${enrs.filter(e => lms.paymentState(e) === 'trial').length} on free trial`, '#/enrollments')}
            ${kpi('fa-flag-checkered', 'bg-gold-50 text-gold-700', 'Completion rate', (enrs.length ? Math.round(completed / enrs.length * 100) : 0) + '%', `${completed} of ${enrs.length} completed`, '#/analytics/courses')}
            ${kpi('fa-award', 'bg-amber-50 text-amber-700', 'Certificates', db.count('certificates', c => !c.revoked), 'issued to students', '#/certificates')}
            ${kpi('fa-sack-dollar', 'bg-emerald-50 text-emerald-700', 'Revenue', ui.money(revenue), `${db.count('orders', { status: 'pending' })} orders pending`, '#/payments')}
        </section>

        <div class="grid lg:grid-cols-5 xl:grid-cols-3 gap-5 mt-5">
            <section class="lg:col-span-3 xl:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 min-w-0">
                <div class="flex flex-wrap items-start justify-between gap-3 mb-5">
                    <div><h2 class="font-semibold text-ink">New enrollments</h2><div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1"><span class="font-display text-2xl text-ink">${last30}</span><span class="text-xs text-slate-500 whitespace-nowrap">in the last 30 days</span>${trend}</div></div>
                    <a href="#/enrollments" class="text-xs font-semibold text-forest hover:underline">View enrollments</a>
                </div>
                ${A.barChart(series, { height: 190, minMax: 4, empty: 'No enrollments in the last 30 days' })}
            </section>
            <section class="lg:col-span-2 xl:col-span-1 bg-white rounded-2xl border border-slate-200/80 p-5 min-w-0">
                <div class="flex items-center justify-between gap-3 mb-3"><h2 class="font-semibold text-ink">Needs attention</h2><span class="text-xs font-semibold px-2 py-0.5 rounded-full ${open ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}">${open ? open + ' open' : 'All clear'}</span></div>
                <div class="divide-y divide-slate-100">${tasks.map(([href, ic, tone, label, sub, n]) => `<a href="${href}" class="flex items-center gap-3 py-3 group">
                    <span class="w-9 h-9 rounded-xl ${n ? tone : 'bg-slate-50 text-slate-400'} flex items-center justify-center text-sm shrink-0"><i class="fa-solid ${ic}"></i></span>
                    <span class="min-w-0 flex-1"><span class="block text-sm font-medium ${n ? 'text-ink' : 'text-slate-500'} truncate group-hover:underline">${label}</span><span class="block text-xs text-slate-500 truncate">${sub}</span></span>
                    ${n ? `<span class="min-w-[24px] h-6 px-2 rounded-full bg-ink text-white text-xs font-bold flex items-center justify-center">${n}</span>` : '<span class="text-xs text-emerald-700 font-medium flex items-center gap-1"><i class="fa-solid fa-check text-[10px]"></i>Clear</span>'}
                    <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-slate-500"></i></a>`).join('')}</div>
            </section>
        </div>

        <section aria-label="Quick actions" class="bg-white rounded-2xl border border-slate-200/80 p-2 mt-5 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1">
            ${actions.map(([h, ic, l]) => `<a href="${h}" class="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium text-slate-700 hover:bg-forest-50 hover:text-forest transition-colors"><i class="fa-solid ${ic} text-xs text-slate-400"></i>${l}</a>`).join('')}
        </section>

        <div class="grid lg:grid-cols-2 gap-5 mt-5">
            ${A.card(A.cardTitle('Most popular courses', '<a href="#/analytics/courses" class="text-xs font-semibold text-forest hover:underline">Analytics</a>') + (popular.length ? `<div class="space-y-3.5">${popular.map(({ c, n }, i) => `<a href="#/courses/${c.id}" class="flex items-center gap-3 group"><span class="w-5 text-xs font-semibold text-slate-400 text-right">${i + 1}</span><img src="${esc(c.thumbnail)}" alt="" class="w-12 h-9 rounded-lg object-cover bg-slate-100 shrink-0"><div class="flex-1 min-w-0"><div class="text-sm font-medium text-ink truncate group-hover:underline">${esc(c.title)}</div><div class="h-1.5 bg-slate-100 rounded-full mt-1.5"><div class="h-1.5 rounded-full bg-forest-600" style="width:${popular[0].n ? n / popular[0].n * 100 : 0}%"></div></div></div><span class="text-sm font-semibold text-ink w-14 text-right whitespace-nowrap">${n} <span class="text-xs font-normal text-slate-400">${n === 1 ? 'student' : 'students'}</span></span></a>`).join('')}</div>` : '<p class="text-sm text-slate-500">No courses yet.</p>'), 'p-5 min-w-0')}
            ${A.card(A.cardTitle('Recent enrollments', '<a href="#/enrollments" class="text-xs font-semibold text-forest hover:underline">View all</a>') + `<div class="divide-y divide-slate-100 -my-2">${enrs.slice().sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt)).slice(0, 5).map(e => `<div class="flex items-center gap-3 py-2.5">${A.avatar(A.userName(e.userId))}<div class="min-w-0 flex-1"><div class="text-sm font-medium text-ink truncate">${esc(A.userName(e.userId))}</div><div class="text-xs text-slate-500 truncate">${esc(A.courseTitle(e.courseId))}</div></div><span class="text-xs text-slate-400 whitespace-nowrap">${ui.timeAgo(e.enrolledAt)}</span></div>`).join('') || '<p class="text-sm text-slate-500 py-2">No enrollments yet.</p>'}</div>`, 'p-5 min-w-0')}
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
    // Re-render the vault emblem so its intro plays every time the sign-in screen is shown
    const vault = document.getElementById('vault'); if (vault) vault.innerHTML = ui.vaultLogo(240);
    setTimeout(() => document.getElementById('adminId').focus(), 30);
};
// Emblem state: armed while the form has focus, red on a failed attempt, green when access is granted
const vaultState = (cls, on) => { const v = document.querySelector('#vault .vl'); if (v) v.classList.toggle(cls, on); return v; };
A.start = function () {
    ui.applyBrandLogos();
    let fails = 0, lockUntil = 0;
    document.getElementById('loginForm').onsubmit = async e => {
        e.preventDefault();
        const err = document.getElementById('loginErr');
        if (Date.now() < lockUntil) { err.textContent = `Too many attempts. Try again in ${Math.ceil((lockUntil - Date.now()) / 1000)}s.`; return err.classList.remove('hidden'); }
        let ok = false, problem = '';
        try { ok = await auth.adminLogin(document.getElementById('adminId').value, document.getElementById('adminPass').value); } catch (x) { problem = x.message; }   // with the school server, signing in is asynchronous
        if (ok) {
            fails = 0; err.classList.add('hidden'); document.getElementById('adminPass').value = '';
            const v = vaultState('granted', true), open = () => { vaultState('granted', false); document.getElementById('login').classList.add('hidden'); document.getElementById('shell').classList.remove('hidden'); document.getElementById('adminEmailLabel').textContent = db.settings().school.adminEmail || ''; A.dispatch(); };
            return v && v.getBoundingClientRect().width ? setTimeout(open, 650) : open();
        }
        const v = vaultState('denied', false); if (v) { void v.getBoundingClientRect(); vaultState('denied', true); setTimeout(() => vaultState('denied', false), 900); }
        if (++fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
        err.textContent = problem || 'Invalid admin email or passcode.'; err.classList.remove('hidden');
    };
    const lf = document.getElementById('loginForm');
    lf.addEventListener('focusin', () => vaultState('armed', true));
    lf.addEventListener('focusout', () => setTimeout(() => vaultState('armed', lf.contains(document.activeElement)), 0));
    document.getElementById('logoutBtn').onclick = async () => { await auth.adminLogout(); A.showLogin(); };
    document.getElementById('navToggle').onclick = () => { document.getElementById('nav').classList.remove('-translate-x-full'); document.getElementById('navScrim').classList.remove('hidden'); };
    document.getElementById('navScrim').onclick = () => { document.getElementById('nav').classList.add('-translate-x-full'); document.getElementById('navScrim').classList.add('hidden'); };
    document.getElementById('adminEmailLabel').textContent = db.settings().school.adminEmail || '';
    window.addEventListener('hashchange', () => A.dispatch());
    if (auth.isAdmin()) { document.getElementById('shell').classList.remove('hidden'); A.dispatch(); } else A.showLogin();
};
