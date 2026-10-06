// Portals: student & staff sign-in, the student "My Learning" dashboard and the staff Instructor Hub.
// Uses the globals declared in home.js (db, lms, ui, auth, esc).
let currentUser = auth.current();
let courses = [], students = [];              // legacy-shaped views used by the Instructor Hub
const escapeHtml = esc, initials = ui.initials, toast = ui.toast;
const hashStr = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const progressOf = s => s.progress || 0;
const isActiveTrial = s => /Active Trial/.test(s.status);
const firstName = n => String(n).trim().split(/\s+/)[0] || 'there';
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ---------------- Sign in ----------------
let authRole = null, authMode = 'login';
function openCourseraAuthModal(role, mode) {
    document.getElementById('courseraAuthModal').classList.remove('hidden');
    if (role) { chooseRole(role); if (mode === 'register' && role === 'student') setAuthMode('register'); } else backToRole();
    return false;
}
function backToRole() { authRole = null; document.getElementById('authStepRole').classList.remove('hidden'); document.getElementById('authStepForm').classList.add('hidden'); }
function chooseRole(role) {
    if (role === 'student') { location.href = '/student/login'; return; }
    authRole = role;
    const staff = role === 'staff';
    document.getElementById('authStepRole').classList.add('hidden');
    document.getElementById('authStepForm').classList.remove('hidden');
    const badge = document.getElementById('authRoleBadge');
    badge.textContent = staff ? 'Staff / Instructor' : 'Student';
    badge.className = 'pill mb-2 ' + (staff ? 'bg-gold-100 text-gold-700' : 'bg-forest-50 text-forest');
    document.getElementById('authModeTabs').classList.toggle('hidden', staff);
    document.getElementById('authStaffNote').classList.toggle('hidden', !staff);
    setAuthMode('login');
    setTimeout(() => document.getElementById('authEmailInput').focus(), 30);
}
function setAuthMode(mode) {
    authMode = mode;
    const reg = mode === 'register';
    document.getElementById('authNameWrap').classList.toggle('hidden', !reg);
    document.getElementById('authNameInput').required = reg;
    document.getElementById('authTitle').textContent = reg ? 'Create your free account' : (authRole === 'staff' ? 'Staff log in' : 'Welcome back');
    document.getElementById('authSubmitBtn').textContent = reg ? 'Create account' : 'Log in';
    document.getElementById('authPassInput').autocomplete = reg ? 'new-password' : 'current-password';
    document.getElementById('tabLogin').className = 'py-2 rounded-lg ' + (reg ? 'text-slate-500' : 'bg-white shadow text-ink');
    document.getElementById('tabRegister').className = 'py-2 rounded-lg ' + (reg ? 'bg-white shadow text-ink' : 'text-slate-500');
    showAuthError('');
}
function showAuthError(msg) { const el = document.getElementById('authError'); el.textContent = msg; el.classList.toggle('hidden', !msg); }
function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmailInput').value, password = document.getElementById('authPassInput').value;
    const res = authMode === 'register' && authRole === 'student'
        ? auth.register({ name: document.getElementById('authNameInput').value, email, password })
        : auth.login(email, password, authRole);
    if (res.error) return showAuthError(res.error);
    currentUser = res.user;
    document.getElementById('authPassInput').value = '';
    closeModal('courseraAuthModal');
    // Return to the page that asked for sign-in (only same-site relative paths are allowed)
    const next = ui.qs('next');
    if (next && /^[\w.-]+\.html(\?[^#]*)?$/.test(next)) { location.href = next; return; }
    goToPortal();
}
function logoutUser(e) {
    if (e) e.stopPropagation();
    auth.logout(); currentUser = null;
    go('home');
}

// ---------------- Instructor Hub (staff) ----------------
function switchTab(prefix, name) {
    const idBase = prefix === 's' ? 'staffTab-' : 'adminTab-';
    document.querySelectorAll('.' + prefix + 'tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== idBase + name));
    document.querySelectorAll('.' + prefix + 'tab').forEach(b => {
        const on = b.dataset[prefix + 'tab'] === name;
        const [onCls, offCls] = prefix === 'a'
            ? [['bg-[#C4A649]', 'text-slate-900'], ['text-emerald-100', 'hover:bg-white/10']]
            : [['bg-emerald-600', 'text-white'], ['text-emerald-100', 'hover:bg-white/10']];
        onCls.forEach(c => b.classList.toggle(c, on)); offCls.forEach(c => b.classList.toggle(c, !on));
    });
}
const staffTab = n => switchTab('s', n);
const localISO = offsetDays => new Date(Date.now() + offsetDays * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysUntil = d => Math.ceil((new Date(d + 'T23:59:59') - Date.now()) / 86400000);
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const AVATAR_BG = ['bg-emerald-500', 'bg-violet-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500'];
const CAT_ICON = { 'Business & Marketing': 'fa-chart-line', 'Design': 'fa-pen-ruler', 'Development': 'fa-code', 'AI & Data': 'fa-brain', 'Security & Cloud': 'fa-cloud' };
const CAT_TONE = { 'Business & Marketing': 'bg-amber-100 text-amber-600', 'Design': 'bg-rose-100 text-rose-600', 'Development': 'bg-emerald-100 text-emerald-600', 'AI & Data': 'bg-violet-100 text-violet-600', 'Security & Cloud': 'bg-sky-100 text-sky-600' };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let announcements = JSON.parse(localStorage.getItem('to_announcements')) || [
    { text: 'Welcome to the new Instructor Hub. Check your timetable and classes here.', by: 'Admin', ts: Date.now() - 86400000 },
    { text: 'Reminder: student trial follow-ups are due by Friday.', by: 'Admin', ts: Date.now() - 3 * 86400000 }
];
let tasks = JSON.parse(localStorage.getItem('to_tasks')) || [
    { id: 1, title: 'Build a landing page', course: 'Web Development', type: 'assignment', due: localISO(2), ts: Date.now() - 2 * 86400000 },
    { id: 2, title: 'JavaScript Fundamentals Quiz', course: 'Web Development', type: 'quiz', due: localISO(4), ts: Date.now() - 86400000 },
    { id: 3, title: 'Mobile UI mockup', course: 'App Development', type: 'assignment', due: localISO(6), ts: Date.now() - 3 * 86400000 },
    { id: 4, title: 'React Native Basics Quiz', course: 'App Development', type: 'quiz', due: localISO(9), ts: Date.now() - 4 * 86400000 }
];
let resources = JSON.parse(localStorage.getItem('to_resources')) || [
    { id: 1, title: 'MDN Web Docs', url: 'https://developer.mozilla.org', course: 'Web Development' }
];
let liveSession = JSON.parse(localStorage.getItem('to_live')) || null;
let staffActionKind = null;

// A staff member's classes are the courses that name them as instructor; if none do, show every course
function staffScope() {
    const mine = courses.filter(c => c.instructor.toLowerCase() === currentUser.name.toLowerCase());
    return { classes: mine.length ? mine : courses, fallback: mine.length === 0 };
}
const avgProgress = (c, list) => { const l = list.filter(s => s.course === c.title); return l.length ? Math.round(l.reduce((a, s) => a + progressOf(s), 0) / l.length) : 0; };
const isLive = title => liveSession && liveSession.course === title && Date.now() - liveSession.ts < 2 * 3600000;

function timeAgo(ts) {
    const h = Math.floor((Date.now() - ts) / 3600000);
    if (h < 1) return 'Just now';
    if (h < 24) return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
    const d = Math.floor(h / 24);
    return d === 1 ? 'Yesterday' : d + ' days ago';
}

function openStaffAction(kind) {
    staffActionKind = kind;
    const opts = staffScope().classes.map(c => `<option>${escapeHtml(c.title)}</option>`).join('');
    const inp = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-700';
    const lab = t => `<label class="block text-xs font-bold text-slate-700 mb-1">${t}</label>`;
    const course = `<div>${lab('Class')}<select id="saCourse" class="${inp}">${opts}</select></div>`;
    const cfg = {
        assignment: ['Create assignment or quiz', 'Students in the class will see the due date.', 'Create',
            `<div>${lab('Title')}<input id="saTitle" required maxlength="80" class="${inp}"></div>${course}
             <div class="grid grid-cols-2 gap-3"><div>${lab('Type')}<select id="saType" class="${inp}"><option value="assignment">Assignment</option><option value="quiz">Quiz</option></select></div>
             <div>${lab('Due date')}<input id="saDue" type="date" required min="${localISO(0)}" class="${inp}"></div></div>`],
        live: ['Start live class', 'Marks the class as Live Now on your schedule for the next 2 hours.', 'Go live', course],
        resource: ['Add resource', 'Share a link, slide deck or reading with a class.', 'Add resource',
            `<div>${lab('Title')}<input id="saTitle" required maxlength="80" class="${inp}"></div>${course}<div>${lab('Link (https://...)')}<input id="saUrl" type="url" required placeholder="https://" class="${inp}"></div>`],
        announcement: ['Post announcement', 'Visible to admins and in the activity feed.', 'Post',
            `<div>${lab('Message')}<input id="saText" required maxlength="140" class="${inp}"></div>`]
    }[kind];
    document.getElementById('staffActionTitle').textContent = cfg[0];
    document.getElementById('staffActionHint').textContent = cfg[1];
    document.getElementById('staffActionBtn').textContent = cfg[2];
    document.getElementById('staffActionFields').innerHTML = cfg[3];
    document.getElementById('staffActionError').classList.add('hidden');
    document.getElementById('staffActionModal').classList.remove('hidden');
}

function submitStaffAction(e) {
    e.preventDefault();
    const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const err = document.getElementById('staffActionError');
    const fail = m => { err.textContent = m; err.classList.remove('hidden'); };
    let msg = '';
    if (staffActionKind === 'assignment') {
        if (daysUntil(v('saDue')) < 0) return fail("The due date can't be in the past.");
        tasks.push({ id: Date.now(), title: v('saTitle'), course: v('saCourse'), type: v('saType'), due: v('saDue'), ts: Date.now() });
        save('to_tasks', tasks); msg = (v('saType') === 'quiz' ? 'Quiz' : 'Assignment') + ' created';
    } else if (staffActionKind === 'live') {
        liveSession = { course: v('saCourse'), ts: Date.now() };
        save('to_live', liveSession); msg = v('saCourse') + ' is now Live';
    } else if (staffActionKind === 'resource') {
        if (!/^https?:\/\//i.test(v('saUrl'))) return fail('Enter a link starting with http:// or https://');
        resources.push({ id: Date.now(), title: v('saTitle'), url: v('saUrl'), course: v('saCourse') });
        save('to_resources', resources); msg = 'Resource added';
    } else {
        announcements.unshift({ text: v('saText'), by: currentUser.name, ts: Date.now() });
        save('to_announcements', announcements.slice(0, 20)); msg = 'Announcement posted';
    }
    closeModal('staffActionModal');
    renderStaffDashboard();
    toast(msg);
}

function deleteTask(id) { tasks = tasks.filter(t => t.id !== id); save('to_tasks', tasks); renderStaffDashboard(); }
function deleteResource(id) { resources = resources.filter(r => r.id !== id); save('to_resources', resources); renderStaffDashboard(); }

// Instructor inbox: only conversations addressed to this instructor
let staffConvId = null;
function renderStaffMessages() {
    const me = auth.current(); if (!me || me.role !== 'staff') return;
    const E = TOS.engage, convs = db.where('conversations', { recipientUserId: me.id }).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
    const unread = cv => db.count('messages', m => m.conversationId === cv.id && m.senderId === cv.studentId && !m.readAt);
    if (!staffConvId && convs[0]) staffConvId = convs[0].id;
    const cv = convs.find(c => c.id === staffConvId);
    if (cv) E.markConversationRead(cv.id, 'staff');
    document.getElementById('staffConvList').innerHTML = convs.map(c => { const st = db.get('users', c.studentId) || { name: 'Student' }; return `<button onclick="staffConvId='${c.id}'; renderStaffMessages()" class="w-full text-left flex gap-3 px-4 py-3 border-b ${c.id === staffConvId ? 'bg-emerald-50' : 'hover:bg-slate-50'}"><span class="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center shrink-0">${escapeHtml(initials(st.name))}</span><span class="min-w-0 flex-1"><span class="flex justify-between gap-2"><b class="text-sm text-slate-900 truncate">${escapeHtml(st.name)}</b><span class="text-[10px] text-slate-400">${ui.timeAgo(c.lastMessageAt)}</span></span><span class="block text-xs text-slate-500 truncate">${escapeHtml(c.subject)}</span>${unread(c) ? `<span class="text-[10px] font-bold text-rose-600">${unread(c)} new</span>` : ''}</span></button>`; }).join('') || '<p class="p-6 text-sm text-slate-500">No messages from your students yet.</p>';
    const th = document.getElementById('staffThread');
    if (!cv) { th.innerHTML = '<p class="m-auto text-sm text-slate-500 p-8">Select a conversation.</p>'; return updateStaffMsgBadge(); }
    const st = db.get('users', cv.studentId) || { name: 'Student' };
    const msgs = db.where('messages', { conversationId: cv.id }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    th.innerHTML = `<div class="px-5 py-3 border-b"><div class="font-bold text-slate-900">${escapeHtml(st.name)}</div><div class="text-xs text-slate-500">${escapeHtml(cv.subject)}${cv.courseId ? ' · ' + escapeHtml((db.get('courses', cv.courseId) || {}).title || '') : ''}</div></div>
        <div id="staffMsgs" class="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50 max-h-[480px]">${msgs.map(m => { const mine = m.senderId !== cv.studentId; return `<div class="flex ${mine ? 'justify-end' : ''}"><div class="max-w-[78%]"><div class="rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${mine ? 'bg-[#0c3b2e] text-white' : 'bg-white border'}">${escapeHtml(m.body)}</div><div class="text-[10px] text-slate-400 mt-1 ${mine ? 'text-right' : ''}">${escapeHtml(m.senderName || '')} · ${ui.fmtDateTime(m.createdAt)}</div></div></div>`; }).join('')}</div>
        <form id="staffReply" class="p-4 border-t flex gap-2"><textarea rows="2" required class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Reply to ${escapeHtml(st.name)}"></textarea><button class="bg-[#0c3b2e] text-white text-sm font-bold px-4 rounded-xl">Send</button></form>`;
    document.getElementById('staffReply').onsubmit = e => {
        e.preventDefault(); const t = e.target.querySelector('textarea'); if (!t.value.trim()) return;
        TOS.engage.sendMessage(cv.id, { senderId: me.id, senderName: me.name, senderRole: 'instructor', body: t.value.trim() });
        renderStaffMessages(); toast('Reply sent');
    };
    const box = document.getElementById('staffMsgs'); box.scrollTop = box.scrollHeight;
    updateStaffMsgBadge();
}
function updateStaffMsgBadge() {
    const me = auth.current(); if (!me) return;
    const n = TOS.engage.unreadMessagesForStaff({ recipientUserId: me.id }), b = document.getElementById('staffMsgBadge');
    if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
}

function renderStaffDashboard() {
    currentUser = auth.current();
    if (!currentUser || currentUser.role !== 'staff') return;
    courses = lms.legacyCourses(); students = lms.legacyStudents();
    updateStaffMsgBadge();
    const now = new Date(), hr = now.getHours();
    const { classes, fallback } = staffScope();
    const titles = classes.map(c => c.title);
    const mine = students.filter(s => titles.includes(s.course));
    const myTasks = tasks.filter(t => titles.includes(t.course)).sort((a, b) => a.due.localeCompare(b.due));
    const open = myTasks.filter(t => daysUntil(t.due) >= 0);
    const pendingA = open.filter(t => t.type === 'assignment'), quizzes = open.filter(t => t.type === 'quiz');
    const dueSoon = open.filter(t => daysUntil(t.due) <= 7).length;
    const q = document.getElementById('staffSearch').value.trim().toLowerCase();

    document.getElementById('staffUserName').textContent = currentUser.name;
    document.getElementById('staffAvatar').textContent = initials(currentUser.name);
    document.getElementById('staffWelcome').textContent = currentUser.name;
    document.getElementById('staffSummary').textContent = `${classes.length} class${classes.length === 1 ? '' : 'es'} • ${mine.length} student${mine.length === 1 ? '' : 's'} • ${dueSoon} due this week • ` + now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const note = document.getElementById('staffScopeNote');
    note.classList.toggle('hidden', !fallback);
    note.textContent = fallback ? 'Showing all courses because none list you as the instructor. Ask an admin to set your name as the instructor on a course to see only your classes.' : '';

    const followUp = mine.filter(s => s.owing).length + open.filter(t => daysUntil(t.due) <= 2).length;
    const bell = document.getElementById('staffBell'); bell.textContent = followUp; bell.classList.toggle('hidden', !followUp);

    document.getElementById('staffStatStudents').textContent = mine.length;
    document.getElementById('staffStatStudentsSub').textContent = mine.filter(isActiveTrial).length + ' on active trial';
    document.getElementById('staffStatCourses').textContent = classes.length;
    document.getElementById('staffStatAssign').textContent = pendingA.length;
    document.getElementById('staffStatAssignSub').textContent = pendingA.filter(t => daysUntil(t.due) <= 7).length + ' due this week';
    document.getElementById('staffStatQuiz').textContent = quizzes.length;
    document.getElementById('staffStatQuizSub').textContent = quizzes.length ? 'Next: ' + fmtDate(quizzes[0].due).replace(/, \d{4}/, '') : 'None scheduled';

    // Class performance: share of each class's students by progress band
    document.getElementById('staffPerf').innerHTML = classes.slice(0, 8).map(c => {
        const l = mine.filter(s => s.course === c.title), n = l.length || 1;
        const done = l.filter(s => progressOf(s) >= 70).length, mid = l.filter(s => progressOf(s) >= 30 && progressOf(s) < 70).length, none = l.length - done - mid;
        const bar = (cnt, col) => `<div class="w-3 sm:w-4 rounded-t ${col}" style="height:${Math.max(2, cnt / n * 100)}%"></div>`;
        return `<div class="flex-1 min-w-[64px] flex flex-col items-center justify-end h-full gap-1" title="${escapeHtml(c.title)}: ${l.length} student${l.length === 1 ? '' : 's'}">
            <div class="flex items-end gap-1 h-32">${bar(done, 'bg-emerald-600')}${bar(mid, 'bg-teal-400')}${bar(none, 'bg-sky-200')}</div>
            <span class="text-[10px] text-slate-500 text-center truncate w-full pb-1">${escapeHtml(c.title.split(' ').slice(0, 2).join(' '))}</span></div>`;
    }).join('') || '<p class="text-xs text-slate-500 m-auto">No classes yet.</p>';

    // Recent activity: enrollments, assignments you set, announcements
    const feed = mine.map(s => ({ ts: new Date(s.trialEnd) - 7 * 86400000, who: s.name, text: 'joined your ' + s.course + ' class' }))
        .concat(myTasks.map(t => ({ ts: t.ts || 0, who: currentUser.name, text: 'set ' + (t.type === 'quiz' ? 'quiz: ' : 'assignment: ') + t.title })))
        .concat(announcements.slice(0, 3).map(a => ({ ts: a.ts, who: a.by, text: a.text })))
        .sort((a, b) => b.ts - a.ts).slice(0, 5);
    document.getElementById('staffActivity').innerHTML = feed.map(f => `
        <div class="flex items-center gap-3"><span class="w-9 h-9 rounded-full ${AVATAR_BG[hashStr(f.who) % 5]} text-white text-[11px] font-bold flex items-center justify-center shrink-0">${escapeHtml(initials(f.who))}</span>
        <div class="min-w-0"><div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(f.who)}</div><div class="text-[11px] text-slate-500 truncate">${escapeHtml(f.text)}</div><div class="text-[10px] text-slate-400">${timeAgo(f.ts)}</div></div></div>`).join('') || '<p class="text-xs text-slate-500">No activity yet.</p>';

    // My classes (dashboard cards + full tab)
    const lessons = c => { const tot = c.syllabus.length * 4, p = avgProgress(c, mine); return [Math.round(p / 100 * tot), tot, p]; };
    document.getElementById('staffClassCards').innerHTML = classes.filter(c => !q || c.title.toLowerCase().includes(q)).slice(0, 4).map(c => { const [d, t, p] = lessons(c); return `
        <div class="border rounded-xl p-3"><span class="w-9 h-9 rounded-lg flex items-center justify-center ${CAT_TONE[c.category] || 'bg-slate-100 text-slate-600'}"><i class="fa-solid ${CAT_ICON[c.category] || 'fa-book'}"></i></span>
        <div class="text-xs font-bold text-slate-900 mt-2 truncate">${escapeHtml(c.title)}</div><div class="text-[10px] text-slate-500">${escapeHtml(c.level)}</div>
        <div class="h-1.5 bg-slate-100 rounded-full mt-3"><div class="h-1.5 rounded-full bg-emerald-600" style="width:${p}%"></div></div>
        <div class="flex justify-between text-[10px] text-slate-500 mt-1"><b class="text-slate-700">${p}%</b><span>${d}/${t} lessons</span></div></div>`; }).join('');
    document.getElementById('staffClassesList').innerHTML = classes.filter(c => !q || c.title.toLowerCase().includes(q)).map(c => { const [d, t, p] = lessons(c); return `
        <div class="bg-white border rounded-2xl p-5"><div class="flex items-center gap-3"><span class="w-11 h-11 rounded-xl flex items-center justify-center text-lg ${CAT_TONE[c.category] || 'bg-slate-100 text-slate-600'}"><i class="fa-solid ${CAT_ICON[c.category] || 'fa-book'}"></i></span>
        <div class="min-w-0"><div class="font-bold text-slate-900 truncate">${escapeHtml(c.title)}</div><div class="text-xs text-slate-500">${escapeHtml(c.level)} • ${escapeHtml(c.instructor)}</div></div></div>
        <div class="flex justify-between text-xs text-slate-600 mt-4"><span>${mine.filter(s => s.course === c.title).length} enrolled</span><span>${d}/${t} lessons • ${p}%</span></div>
        <div class="h-2 bg-slate-100 rounded-full mt-1.5"><div class="h-2 rounded-full bg-emerald-600" style="width:${p}%"></div></div>
        <div class="flex flex-wrap gap-1.5 mt-3">${c.syllabus.map(s => `<span class="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">${escapeHtml(s)}</span>`).join('')}</div></div>`; }).join('') || '<p class="text-xs text-slate-500">No classes match.</p>';

    // Upcoming assignments
    const chip = t => { const d = daysUntil(t.due); return d < 0 ? ['Overdue', 'bg-rose-100 text-rose-700'] : d <= 2 ? ['Due soon', 'bg-amber-100 text-amber-700'] : ['Upcoming', 'bg-sky-100 text-sky-700']; };
    document.getElementById('staffUpcoming').innerHTML = myTasks.filter(t => !q || (t.title + t.course).toLowerCase().includes(q)).slice(0, 4).map(t => { const c = chip(t); return `
        <div class="flex items-center gap-3"><span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.type === 'quiz' ? 'bg-sky-100 text-sky-600' : 'bg-orange-100 text-orange-600'}"><i class="fa-solid ${t.type === 'quiz' ? 'fa-file-circle-question' : 'fa-file-lines'}"></i></span>
        <div class="flex-1 min-w-0"><div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(t.title)}</div><div class="text-[11px] text-slate-500">Due: ${fmtDate(t.due)}</div></div>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${c[1]}">${c[0]}</span></div>`; }).join('') || '<p class="text-xs text-slate-500">Nothing scheduled. Create an assignment to get started.</p>';

    // Today's schedule
    const slots = [[9, 10], [11, 12], [14, 15], [16, 17]], cur = hr + now.getMinutes() / 60;
    const pad = h => String(h).padStart(2, '0') + ':00';
    document.getElementById('staffToday').innerHTML = classes.slice(0, 4).map((c, i) => {
        const [s, e] = slots[i];
        const st = isLive(c.title) ? ['Live Now', 'bg-emerald-100 text-emerald-700', 'fa-video'] : cur >= e ? ['Done', 'bg-slate-100 text-slate-500', ''] : cur >= s ? ['In session', 'bg-emerald-100 text-emerald-700', ''] : ['Upcoming', 'bg-sky-100 text-sky-700', ''];
        return `<div class="flex items-center gap-3 border-l-2 ${st[0] === 'Live Now' ? 'border-emerald-500' : 'border-slate-200'} pl-3"><div class="text-[11px] font-bold text-slate-600 w-14 shrink-0">${pad(s)} - ${pad(e)}</div>
            <div class="flex-1 min-w-0 text-xs font-semibold text-slate-800 truncate">${escapeHtml(c.title)}</div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${st[1]}">${st[2] ? `<i class="fa-solid ${st[2]} mr-1"></i>` : ''}${st[0]}</span></div>`;
    }).join('') || '<p class="text-xs text-slate-500">No classes today.</p>';

    // Students tab
    const filter = document.getElementById('staffCourseFilter'), chosen = filter.value;
    filter.innerHTML = '<option value="">All my classes</option>' + titles.map(t => `<option>${escapeHtml(t)}</option>`).join('');
    filter.value = chosen;
    const rows = mine.filter(s => (!chosen || s.course === chosen) && (!q || (s.name + s.email + s.course).toLowerCase().includes(q)));
    document.getElementById('staffStudentsTable').innerHTML = rows.length ? rows.map(s => `
        <tr class="border-b">
            <td class="p-3"><div class="flex items-center gap-3"><span class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">${escapeHtml(initials(s.name))}</span><span class="font-medium text-slate-900">${escapeHtml(s.name)}</span></div></td>
            <td class="p-3 text-slate-600 font-mono text-xs">${escapeHtml(s.email)}</td>
            <td class="p-3 text-slate-700">${escapeHtml(s.course)}</td>
            <td class="p-3 w-40"><div class="h-2 bg-slate-100 rounded-full"><div class="h-2 rounded-full bg-emerald-500" style="width:${progressOf(s)}%"></div></div><span class="text-[10px] text-slate-500">${progressOf(s)}%</span></td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.owing ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${escapeHtml(s.status)}</span></td>
        </tr>`).join('') : '<tr><td colspan="5" class="p-6 text-center text-xs text-slate-500">No students match.</td></tr>';

    // Assignments tab
    document.getElementById('staffAssignTable').innerHTML = myTasks.length ? myTasks.map(t => { const c = chip(t); return `
        <tr class="border-b"><td class="p-3 font-medium text-slate-900">${escapeHtml(t.title)}</td><td class="p-3 text-slate-700">${escapeHtml(t.course)}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${t.type === 'quiz' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'}">${t.type === 'quiz' ? 'Quiz' : 'Assignment'}</span></td>
        <td class="p-3 text-xs text-slate-600">${fmtDate(t.due)} <span class="ml-1 px-2 py-0.5 rounded text-[10px] font-bold ${c[1]}">${c[0]}</span></td>
        <td class="p-3 text-right"><button onclick="deleteTask(${t.id})" class="text-xs text-rose-600 font-semibold hover:underline">Delete</button></td></tr>`; }).join('')
        : '<tr><td colspan="5" class="p-6 text-center text-xs text-slate-500">Nothing set yet.</td></tr>';

    // Resources tab
    const myRes = resources.filter(r => titles.includes(r.course) && (!q || (r.title + r.course).toLowerCase().includes(q)));
    document.getElementById('staffResourceList').innerHTML = myRes.map(r => `
        <div class="border rounded-xl p-4 flex items-center gap-3"><span class="w-10 h-10 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-link"></i></span>
        <div class="flex-1 min-w-0"><div class="text-sm font-bold text-slate-900 truncate">${/^https?:\/\//i.test(r.url) ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer" class="hover:underline">${escapeHtml(r.title)}</a>` : escapeHtml(r.title)}</div><div class="text-[11px] text-slate-500">${escapeHtml(r.course)}</div></div>
        <button onclick="deleteResource(${r.id})" class="text-xs text-rose-600 font-semibold hover:underline">Remove</button></div>`).join('') || '<p class="text-xs text-slate-500">No resources yet. Add one to share with your class.</p>';

    // Timetable
    const times = ['09:00', '11:00', '14:00', '16:00'];
    document.getElementById('staffTimetable').innerHTML = '<thead><tr class="text-xs uppercase text-slate-400"><th class="p-2 text-left">Time</th>' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => `<th class="p-2 text-left">${d}</th>`).join('') + '</tr></thead><tbody>'
        + times.map((tm, r) => `<tr><td class="p-2 text-xs font-bold text-slate-500">${tm}</td>` + [0, 1, 2, 3, 4].map(cI => {
            const c = classes.length ? classes[(r + cI) % classes.length] : null;
            return `<td class="p-3 rounded-xl ${(r + cI) % 2 ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'} text-xs font-semibold">${c ? escapeHtml(c.title) : ''}</td>`;
        }).join('') + '</tr>').join('') + '</tbody>';
}
