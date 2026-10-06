// Student dashboard
(function () {
    const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
    S.courseCard = c => `<a href="/student/course/${c.id}" class="s-card s-card-hover overflow-hidden flex flex-col">
        <div class="relative aspect-[16/9] bg-slate-100">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="" loading="lazy" class="w-full h-full object-cover">` : ''}
            <span class="absolute top-3 left-3">${S.statusChip(c.status)}</span>${c.payment === 'trial' ? '<span class="absolute top-3 right-3 s-chip bg-gold-100 text-gold-700">Free trial</span>' : ['overdue', 'pending'].includes(c.payment) ? '<span class="absolute top-3 right-3 s-chip bg-rose-50 text-rose-700">Payment due</span>' : ''}</div>
        <div class="p-4 flex-1 flex flex-col">
            <div class="text-xs s-muted">${esc(c.category)}</div>
            <h3 class="font-semibold text-slate-900 leading-snug mt-0.5">${esc(c.title)}</h3>
            <div class="text-xs s-muted mt-1"><i class="fa-solid fa-chalkboard-user mr-1"></i>${esc(c.instructor)}</div>
            <div class="mt-auto pt-4"><div class="flex justify-between text-xs mb-1.5"><span class="s-muted">${c.done}/${c.total} lessons</span><span class="font-semibold text-slate-900">${c.pct}%</span></div>${S.bar(c.pct)}
            <div class="flex items-center justify-between mt-3"><span class="text-[11px] text-slate-400">${c.lastAccessAt ? 'Last accessed ' + ui.timeAgo(c.lastAccessAt) : 'Not started yet'}</span><span class="text-sm font-semibold text-forest-600">${c.status === 'completed' ? 'Review' : c.done ? 'Continue' : 'Start'} <i class="fa-solid fa-arrow-right text-xs"></i></span></div></div>
        </div></a>`;
    const EVT_STYLE = { class: 'bg-forest-50 text-forest', exam: 'bg-rose-50 text-rose-700', quiz: 'bg-violet-50 text-violet-700', deadline: 'bg-gold-50 text-gold-700', event: 'bg-sky-50 text-sky-700', holiday: 'bg-emerald-50 text-emerald-700', announcement: 'bg-slate-100 text-slate-600' };
    S.EVT_STYLE = EVT_STYLE;
    S.eventRow = e => {
        const d = new Date(e.startsAt), T = TOS.engage.EVENT_TYPES[e.type] || TOS.engage.EVENT_TYPES.event;
        return `<a href="${e.link || '/student/calendar'}" class="flex items-center gap-3 py-3 group">
            <div class="w-12 text-center rounded-xl border border-[#E6E8EC] py-1 shrink-0"><div class="text-[10px] font-bold uppercase text-rose-600">${d.toLocaleDateString(undefined, { month: 'short' })}</div><div class="text-lg font-bold text-slate-900 leading-none">${d.getDate()}</div></div>
            <div class="min-w-0 flex-1"><div class="text-sm font-medium text-slate-900 truncate group-hover:underline">${esc(e.title)}</div><div class="text-xs s-muted truncate">${e.allDay ? 'All day' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}${e.course ? ' · ' + esc(e.course) : ''}${e.location ? ' · ' + esc(e.location) : ''}</div></div>
            <span class="s-chip ${EVT_STYLE[e.type] || ''} hidden sm:inline-flex"><i class="fa-solid ${T[1]}"></i>${T[0]}</span></a>`;
    };

    S.route('/student/dashboard', { title: 'Dashboard', nav: 'dashboard', live: true, render: async el => {
        const d = await api.dashboard(), me = S.me, first = me.name.split(' ')[0];
        const c = d.continue;
        const stat = (icon, tone, label, value, sub, href) => `<a href="${href}" class="s-card s-card-hover p-5"><div class="flex items-center justify-between"><span class="text-sm s-muted">${label}</span><span class="w-9 h-9 rounded-xl ${tone} flex items-center justify-center text-sm"><i class="fa-solid ${icon}"></i></span></div><div class="text-3xl font-bold text-slate-900 mt-2">${value}</div>${sub ? `<div class="text-xs s-muted mt-1">${sub}</div>` : ''}</a>`;
        el.innerHTML = `
            <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
                <div><p class="text-sm s-muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <h1 class="font-display text-[28px] sm:text-[34px] text-slate-900 leading-tight mt-1">${greeting()}, ${esc(first)} <span aria-hidden="true">👋</span></h1>
                    <p class="s-muted mt-1">${d.stats.enrolled ? 'Continue your learning journey.' : 'Welcome to your student portal. Let\'s find your first course.'}</p></div>
                <div class="flex items-center gap-2"><span class="s-chip bg-gold-50 text-gold-700 !text-xs !py-1.5 !px-3"><i class="fa-solid fa-fire"></i>${ui.plural(d.streak, 'day')} streak</span>${d.assignmentsDueCount ? `<a href="/student/assignments" class="s-chip bg-rose-50 text-rose-700 !text-xs !py-1.5 !px-3"><i class="fa-solid fa-hourglass-half"></i>${d.assignmentsDueCount} due</a>` : ''}</div>
            </div>

            <div class="grid grid-cols-2 xl:grid-cols-4 gap-4">
                ${stat('fa-book-open', 'bg-forest-50 text-forest', 'Courses enrolled', d.stats.enrolled, d.lessonsTotal ? `${d.lessonsDone}/${d.lessonsTotal} lessons done` : '', '/student/my-courses')}
                ${stat('fa-spinner', 'bg-sky-50 text-sky-700', 'In progress', d.stats.inProgress, '', '/student/my-courses?filter=in_progress')}
                ${stat('fa-flag-checkered', 'bg-emerald-50 text-emerald-700', 'Completed', d.stats.completed, '', '/student/my-courses?filter=completed')}
                ${stat('fa-award', 'bg-gold-50 text-gold-700', 'Certificates earned', d.stats.certificates, '', '/student/certificates')}
            </div>

            <div class="grid xl:grid-cols-3 gap-5 mt-5">
                <section class="xl:col-span-2" aria-labelledby="clh">
                    ${c && c.current ? `<div class="relative overflow-hidden rounded-2xl bg-ink text-white">
                        <div class="absolute inset-0 opacity-25">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="" class="w-full h-full object-cover">` : ''}</div>
                        <div class="absolute inset-0 bg-gradient-to-r from-ink via-ink/90 to-ink/40"></div>
                        <div class="relative p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
                            <div class="flex-1 min-w-0">
                                <h2 id="clh" class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-200">Continue learning</h2>
                                <div class="text-2xl font-semibold mt-2 leading-snug">${esc(c.title)}</div>
                                <div class="mt-3 space-y-1 text-sm text-white/75"><div><i class="fa-solid fa-layer-group w-5 text-gold-200"></i>Section ${c.current.sectionIndex} · ${esc(c.current.sectionTitle)}</div><div><i class="fa-solid ${S.LESSON_ICON(c.current.type)} w-5 text-gold-200"></i>Lesson ${c.current.index} · ${esc(c.current.title)}</div></div>
                                <div class="mt-5 max-w-md"><div class="flex justify-between text-xs mb-1.5 text-white/70"><span>Progress</span><b class="text-white">${c.pct}%</b></div><div class="h-2 rounded-full bg-white/15"><div class="h-2 rounded-full bg-gold" style="width:${c.pct}%"></div></div></div>
                            </div>
                            <a href="/student/learn/${c.current.id}" class="btn btn-gold h-12 px-6 self-start sm:self-center"><i class="fa-solid fa-play text-xs"></i>${c.done ? 'Continue learning' : 'Start learning'}</a>
                        </div></div>`
                    : S.empty('fa-rocket', 'No courses yet', 'Enroll in a program to start learning. Your progress, assignments and certificates will appear here.', '<a href="/student/browse" class="btn btn-forest btn-sm">Browse courses</a>')}
                </section>
                <section class="s-card p-5 flex flex-col" aria-labelledby="oph">
                    <h2 id="oph" class="s-h2">Overall learning progress</h2>
                    <div class="flex items-center gap-5 mt-4">${S.ring(d.overall, 96, 9)}<div class="text-sm space-y-1.5"><div><b class="text-slate-900">${d.lessonsDone}</b> <span class="s-muted">of ${d.lessonsTotal} lessons</span></div><div><b class="text-slate-900">${d.stats.completed}</b> <span class="s-muted">courses completed</span></div><div><b class="text-slate-900">${d.streak}</b> <span class="s-muted">day study streak</span></div></div></div>
                    <a href="/student/progress" class="mt-auto pt-4 text-sm font-semibold text-forest-600 hover:underline">View learning analytics <i class="fa-solid fa-arrow-right text-xs"></i></a>
                </section>
            </div>

            <div class="grid xl:grid-cols-3 gap-5 mt-5">
                <section class="s-card p-5" aria-labelledby="adh"><div class="flex items-center justify-between"><h2 id="adh" class="s-h2">Assignments due</h2><a href="/student/assignments" class="text-xs font-semibold text-forest-600">View all</a></div>
                    ${d.assignmentsDue.length ? `<div class="divide-y divide-[#F1F3F5] mt-2">${d.assignmentsDue.map(a => `<a href="/student/assignments/${a.id}" class="flex items-center gap-3 py-3 group"><span class="w-9 h-9 rounded-xl ${a.status === 'overdue' ? 'bg-rose-50 text-rose-700' : 'bg-gold-50 text-gold-700'} flex items-center justify-center text-sm shrink-0"><i class="fa-solid fa-file-pen"></i></span><div class="min-w-0 flex-1"><div class="text-sm font-medium text-slate-900 truncate group-hover:underline">${esc(a.title)}</div><div class="text-xs ${a.status === 'overdue' ? 'text-rose-700' : 's-muted'} truncate">${a.due ? (a.status === 'overdue' ? 'Overdue · ' : 'Due ') + S.relDate(a.due) : 'No due date'} · ${esc(a.course)}</div></div></a>`).join('')}</div>`
                    : `<p class="text-sm s-muted mt-4"><i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i>No assignments due. You're on top of it.</p>`}</section>
                <section class="s-card p-5" aria-labelledby="uch"><div class="flex items-center justify-between"><h2 id="uch" class="s-h2">Upcoming classes & events</h2><a href="/student/calendar" class="text-xs font-semibold text-forest-600">Calendar</a></div>
                    ${d.upcoming.length ? `<div class="divide-y divide-[#F1F3F5] mt-1">${d.upcoming.slice(0, 4).map(S.eventRow).join('')}</div>` : '<p class="text-sm s-muted mt-4">No upcoming events.</p>'}</section>
                <section class="s-card p-5" aria-labelledby="anh"><div class="flex items-center justify-between"><h2 id="anh" class="s-h2">Announcements</h2><a href="/student/announcements" class="text-xs font-semibold text-forest-600">View all</a></div>
                    ${d.announcements.length ? `<div class="divide-y divide-[#F1F3F5] mt-1">${d.announcements.map(a => `<a href="/student/announcements#${a.id}" class="block py-3 group"><div class="flex items-center gap-2">${a.read ? '' : '<span class="w-2 h-2 rounded-full bg-gold shrink-0" aria-label="Unread"></span>'}<span class="text-sm ${a.read ? 'text-slate-700' : 'font-semibold text-slate-900'} truncate group-hover:underline">${esc(a.title)}</span></div><div class="text-xs s-muted line-clamp-2 mt-0.5">${esc(a.body)}</div><div class="text-[11px] text-slate-400 mt-1">${ui.timeAgo(a.createdAt)}</div></a>`).join('')}</div>` : '<p class="text-sm s-muted mt-4">No announcements yet.</p>'}</section>
            </div>

            ${d.courses.length ? `<section class="mt-8" aria-labelledby="mch"><div class="flex items-center justify-between mb-4"><h2 id="mch" class="text-lg font-semibold text-slate-900">My courses</h2><a href="/student/my-courses" class="text-sm font-semibold text-forest-600">View all</a></div>
                <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">${d.courses.map(S.courseCard).join('')}</div></section>` : ''}

            <section class="s-card mt-8 overflow-hidden" aria-labelledby="rnh"><div class="flex items-center justify-between px-5 pt-5 pb-3"><h2 id="rnh" class="s-h2">Recent notifications</h2><a href="/student/notifications" class="text-xs font-semibold text-forest-600">View all</a></div>
                ${d.notifications.length ? `<div class="divide-y divide-[#F1F3F5]">${d.notifications.map(n => S.notificationRow(n, true)).join('')}</div>` : '<p class="px-5 pb-5 text-sm s-muted">No notifications yet.</p>'}</section>`;
        el.querySelectorAll('[data-notif-link]').forEach(a => a.addEventListener('click', () => api.markNotification(a.dataset.notifLink)));
    } });
})();
