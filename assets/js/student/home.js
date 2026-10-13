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
        const d = await api.dashboard(), me = S.me, first = me.name.split(' ')[0], c = d.continue, enrolled = d.stats.enrolled > 0;
        // New learners get a few places to start (free courses first) instead of an empty page
        const start = enrolled ? [] : (await api.catalog()).filter(x => !x.enrolled).sort((a, b) => (a.price ? 1 : 0) - (b.price ? 1 : 0)).slice(0, 3);
        const stat = (label, value, sub, href) => `<a href="${href}" class="block bg-white px-5 py-4 hover:bg-slate-50 transition"><div class="text-xs font-medium s-muted">${label}</div><div class="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">${value}</div>${sub ? `<div class="text-xs s-muted mt-0.5">${sub}</div>` : ''}</a>`;
        const side = (id, title, link, body) => `<section class="s-card p-5" aria-labelledby="${id}"><div class="flex items-center justify-between gap-3"><h2 id="${id}" class="s-h2">${title}</h2>${link ? `<a href="${link[0]}" class="text-xs font-semibold text-forest-600 hover:underline">${link[1]}</a>` : ''}</div>${body}</section>`;
        const step = (n, t, x) => `<li class="flex gap-3"><span class="w-7 h-7 shrink-0 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center" aria-hidden="true">${n}</span><div><div class="text-sm font-semibold text-slate-900">${t}</div><div class="text-sm s-muted">${x}</div></div></li>`;
        const hero = c && c.current
            ? `<section class="s-card overflow-hidden grid sm:grid-cols-[240px_minmax(0,1fr)]" aria-labelledby="clh">
                <div class="relative bg-slate-100 min-h-[150px]">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="" class="absolute inset-0 w-full h-full object-cover">` : ''}</div>
                <div class="p-6">
                    <h2 id="clh" class="eyebrow">Continue learning</h2>
                    <div class="text-xl font-semibold text-slate-900 mt-1.5 leading-snug">${esc(c.title)}</div>
                    <div class="mt-3 space-y-1 text-sm s-muted"><div><i class="fa-solid fa-layer-group w-5" aria-hidden="true"></i>Section ${c.current.sectionIndex} · ${esc(c.current.sectionTitle)}</div><div><i class="fa-solid ${S.LESSON_ICON(c.current.type)} w-5" aria-hidden="true"></i>Lesson ${c.current.index} · ${esc(c.current.title)}</div></div>
                    <div class="mt-4"><div class="flex justify-between text-xs mb-1.5 s-muted"><span>Course progress</span><b class="text-slate-900">${c.pct}%</b></div>${S.bar(c.pct)}</div>
                    <a href="/student/learn/${c.current.id}" class="btn btn-forest h-11 px-5 mt-5"><i class="fa-solid fa-play text-xs" aria-hidden="true"></i>${c.done ? 'Continue learning' : 'Start learning'}</a>
                </div></section>`
            : `<section class="s-card p-6 sm:p-8" aria-labelledby="gsh">
                <h2 id="gsh" class="text-xl font-semibold text-slate-900">Start your first course</h2>
                <p class="s-muted mt-1">Your progress, assignments and certificates will appear here as you learn.</p>
                <ol class="grid sm:grid-cols-3 gap-5 mt-6">${step(1, 'Choose a course', 'Browse by category, level or price.')}${step(2, 'Enrol', 'Free courses open at once. Paid programmes start with a free trial.')}${step(3, 'Learn and earn', 'Finish the work to earn a certificate.')}</ol>
                ${start.length ? `<div class="mt-7 pt-6 border-t border-[#E6E8EC]"><h3 class="text-sm font-semibold text-slate-900">Good places to start</h3>
                    <div class="grid sm:grid-cols-3 gap-4 mt-4">${start.map(x => `<a href="/student/course/${x.id}" class="group block rounded-xl border border-[#E6E8EC] overflow-hidden hover:border-forest transition"><div class="aspect-[16/9] bg-slate-100">${x.thumbnail ? `<img src="${esc(x.thumbnail)}" alt="" loading="lazy" class="w-full h-full object-cover">` : ''}</div><div class="p-3"><div class="text-sm font-semibold text-slate-900 leading-snug group-hover:underline">${esc(x.title)}</div><div class="text-xs s-muted mt-1">${esc(x.level)} · ${x.hours}h · ${x.price ? ui.money(x.price) : 'Free'}</div></div></a>`).join('')}</div></div>` : ''}
                <a href="/student/browse" class="btn btn-forest h-11 px-5 mt-6">Browse all courses <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i></a>
            </section>`;
        el.innerHTML = `
            <header class="flex flex-wrap items-start justify-between gap-4">
                <div><p class="text-sm s-muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <h1 class="text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight mt-1">${greeting()}, ${esc(first)}</h1>
                    <p class="s-muted mt-1">${enrolled ? 'Pick up where you left off.' : 'Start with a free course or a free trial.'}</p></div>
                <div class="flex flex-wrap items-center gap-2">${d.streak ? `<span class="s-chip bg-gold-50 text-gold-700 !text-xs !py-1.5 !px-3"><i class="fa-solid fa-fire" aria-hidden="true"></i>${ui.plural(d.streak, 'day')} streak</span>` : ''}${d.assignmentsDueCount ? `<a href="/student/assignments" class="s-chip bg-rose-50 text-rose-700 !text-xs !py-1.5 !px-3"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>${d.assignmentsDueCount} due</a>` : ''}${enrolled ? '<a href="/student/browse" class="btn btn-outline btn-sm">Browse courses</a>' : ''}</div>
            </header>

            <div class="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl overflow-hidden border border-[#E6E8EC] bg-[#E6E8EC]">
                ${stat('Courses enrolled', d.stats.enrolled, d.lessonsTotal ? `${d.lessonsDone} of ${d.lessonsTotal} lessons done` : '', '/student/my-courses')}
                ${stat('In progress', d.stats.inProgress, '', '/student/my-courses?filter=in_progress')}
                ${stat('Completed', d.stats.completed, '', '/student/my-courses?filter=completed')}
                ${stat('Certificates', d.stats.certificates, '', '/student/certificates')}
            </div>

            <div class="mt-6 grid xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
                <div class="space-y-6 min-w-0">
                    ${hero}
                    ${d.courses.length ? `<section aria-labelledby="mch"><div class="flex items-center justify-between mb-3"><h2 id="mch" class="s-h2">My courses</h2><a href="/student/my-courses" class="text-xs font-semibold text-forest-600 hover:underline">View all</a></div>
                        <div class="grid sm:grid-cols-2 gap-5">${d.courses.map(S.courseCard).join('')}</div></section>` : ''}
                    <section class="s-card overflow-hidden" aria-labelledby="rnh"><div class="flex items-center justify-between px-5 pt-5 pb-3"><h2 id="rnh" class="s-h2">Recent notifications</h2><a href="/student/notifications" class="text-xs font-semibold text-forest-600 hover:underline">View all</a></div>
                        ${d.notifications.length ? `<div class="divide-y divide-[#F1F3F5]">${d.notifications.map(n => S.notificationRow(n, true)).join('')}</div>` : '<p class="px-5 pb-5 text-sm s-muted">No notifications yet.</p>'}</section>
                </div>
                <aside class="space-y-5 min-w-0" aria-label="Your schedule and updates">
                    ${enrolled ? side('oph', 'Learning progress', ['/student/progress', 'Details'], `<div class="flex items-center gap-5 mt-4">${S.ring(d.overall, 84, 8)}<div class="text-sm space-y-1.5"><div><b class="text-slate-900">${d.lessonsDone}</b> <span class="s-muted">of ${d.lessonsTotal} lessons</span></div><div><b class="text-slate-900">${d.stats.completed}</b> <span class="s-muted">courses completed</span></div></div></div>`) : ''}
                    ${side('adh', 'Assignments due', ['/student/assignments', 'View all'], d.assignmentsDue.length
                        ? `<div class="divide-y divide-[#F1F3F5] mt-2">${d.assignmentsDue.map(a => `<a href="/student/assignments/${a.id}" class="flex items-center gap-3 py-3 group"><span class="w-9 h-9 rounded-lg ${a.status === 'overdue' ? 'bg-rose-50 text-rose-700' : 'bg-gold-50 text-gold-700'} flex items-center justify-center text-sm shrink-0"><i class="fa-solid fa-file-pen" aria-hidden="true"></i></span><div class="min-w-0 flex-1"><div class="text-sm font-medium text-slate-900 truncate group-hover:underline">${esc(a.title)}</div><div class="text-xs ${a.status === 'overdue' ? 'text-rose-700' : 's-muted'} truncate">${a.due ? (a.status === 'overdue' ? 'Overdue · ' : 'Due ') + S.relDate(a.due) : 'No due date'} · ${esc(a.course)}</div></div></a>`).join('')}</div>`
                        : `<p class="text-sm s-muted mt-3">${enrolled ? 'Nothing due. You are up to date.' : 'Assignments from your courses will show here.'}</p>`)}
                    ${side('uch', 'Upcoming classes & events', ['/student/calendar', 'Calendar'], d.upcoming.length ? `<div class="divide-y divide-[#F1F3F5] mt-1">${d.upcoming.slice(0, 4).map(S.eventRow).join('')}</div>` : '<p class="text-sm s-muted mt-3">No upcoming events.</p>')}
                    ${side('anh', 'Announcements', ['/student/announcements', 'View all'], d.announcements.length
                        ? `<div class="divide-y divide-[#F1F3F5] mt-1">${d.announcements.map(a => `<a href="/student/announcements#${a.id}" class="block py-3 group"><div class="flex items-center gap-2">${a.read ? '' : '<span class="w-2 h-2 rounded-full bg-gold shrink-0" aria-label="Unread"></span>'}<span class="text-sm ${a.read ? 'text-slate-700' : 'font-semibold text-slate-900'} truncate group-hover:underline">${esc(a.title)}</span></div><div class="text-xs s-muted line-clamp-2 mt-0.5">${esc(a.body)}</div><div class="text-[11px] s-muted mt-1">${ui.timeAgo(a.createdAt)}</div></a>`).join('')}</div>`
                        : '<p class="text-sm s-muted mt-3">No announcements yet.</p>')}
                </aside>
            </div>`;
        el.querySelectorAll('[data-notif-link]').forEach(a => a.addEventListener('click', () => api.markNotification(a.dataset.notifLink)));
    } });
})();
