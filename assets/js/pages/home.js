// Public site: routing, header, homepage sections and catalog. Everything renders from the LMS database.
const { db, lms, ui, auth } = TOS;
const { esc } = ui;

// ---------------- Routing ----------------
const PUBLIC_PAGES = ['home', 'catalog', 'about'];
function go(page, anchor, opts) {
    if (page === 'catalog' && opts) Object.assign(catalogState, opts);
    showPage(page);
    history.replaceState(null, '', page === 'home' ? (anchor ? '#' + anchor : location.pathname + location.search) : '#' + page);
    if (anchor) setTimeout(() => { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 60);
    return false;
}
function showPage(pageId) {
    const me = auth.current();
    if (pageId === 'staffDash' && !(me && me.role === 'staff')) return me ? goToPortal() : openCourseraAuthModal('staff');
    ui.$$('.page-view').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-' + pageId).classList.remove('hidden');
    window.scrollTo(0, 0);
    const shell = pageId === 'staffDash';
    document.getElementById('siteHeader').classList.toggle('hidden', shell);
    document.getElementById('siteFooter').classList.toggle('hidden', shell);
    if (pageId === 'catalog') renderCatalog();
    if (pageId === 'about') renderAbout();
    if (pageId === 'staffDash') { staffTab('overview'); renderStaffDashboard(); }
    renderAuthArea();
    ui.initReveal();
}
function goToPortal() {
    const me = auth.current();
    if (!me) { location.href = '/student/login'; return false; }
    if (me.role === 'student') { location.href = '/student/dashboard'; return false; }
    showPage('staffDash');
    history.replaceState(null, '', '#my-learning');
    return false;
}
const courseUrl = c => 'course.html?c=' + encodeURIComponent(c.slug);
function openCourseDetail(slugOrId) { const c = lms.courseBySlug(slugOrId); if (c) location.href = courseUrl(c); }

// ---------------- Header ----------------
function renderAuthArea() {
    const me = auth.current(), el = document.getElementById('authArea');
    if (!me) {
        el.innerHTML = `<a href="/student/login" class="hidden sm:inline-flex text-sm font-semibold text-forest hover:text-forest-600 px-2">Log In</a>
            <a href="/student/register" class="btn btn-outline border-forest text-forest h-11">Join for Free</a>`;
        return;
    }
    el.innerHTML = `<button onclick="goToPortal()" class="hidden sm:inline-flex text-sm font-semibold text-forest hover:text-forest-600 px-2">${me.role === 'staff' ? 'Instructor Hub' : 'My Learning'}</button>
        <div class="relative">
            <button onclick="document.getElementById('userMenu').classList.toggle('hidden')" class="flex items-center gap-2 rounded-full pl-1 pr-3 h-11 border border-slate-200 hover:border-forest" aria-label="Account menu">
                <span class="w-9 h-9 rounded-full bg-forest text-gold text-xs font-bold flex items-center justify-center">${esc(ui.initials(me.name))}</span><i class="fa-solid fa-chevron-down text-[10px] text-slate-400"></i></button>
            <div id="userMenu" class="hidden absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-lift border border-slate-100 py-2 text-sm z-50">
                <div class="px-4 py-2 border-b mb-1"><div class="font-semibold text-ink truncate">${esc(me.name)}</div><div class="text-xs text-slate-500 truncate">${esc(me.email)}</div></div>
                <button onclick="goToPortal()" class="w-full text-left px-4 py-2 hover:bg-ivory"><i class="fa-solid fa-graduation-cap w-5 text-slate-400"></i>${me.role === 'staff' ? 'Instructor Hub' : 'My Learning'}</button>
                <a href="verify.html" class="block px-4 py-2 hover:bg-ivory"><i class="fa-solid fa-award w-5 text-slate-400"></i>Certificates</a>
                <button onclick="logoutUser()" class="w-full text-left px-4 py-2 hover:bg-ivory text-rose-700"><i class="fa-solid fa-right-from-bracket w-5"></i>Log out</button>
            </div>
        </div>`;
}
document.addEventListener('click', e => {
    const m = document.getElementById('userMenu'); if (m && !e.target.closest('#authArea')) m.classList.add('hidden');
    if (!e.target.closest('#exploreWrap')) closeExplore();
    if (!e.target.closest('#searchWrap')) document.getElementById('searchSuggest').classList.add('hidden');
});

const topCategories = () => db.ordered('categories', c => !c.parentId);
const subCategories = id => db.ordered('categories', { parentId: id });
const coursesInCategory = id => lms.listedCourses().filter(c => c.categoryId === id || c.subcategoryId === id);

function renderExplore() {
    const cats = topCategories();
    const popular = popularCourses().slice(0, 5);
    document.getElementById('exploreMenu').innerHTML = `
        <div class="col-span-2"><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3">Explore categories</div>
            <div class="grid grid-cols-2 gap-1">${cats.map(c => `<a href="#catalog" onclick="closeExplore(); return go('catalog', null, {cat:'${c.id}'})" class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-ivory group">
                <span class="w-10 h-10 rounded-xl bg-forest-50 text-forest flex items-center justify-center group-hover:bg-forest group-hover:text-gold transition"><i class="fa-solid ${esc(c.icon || 'fa-book')}"></i></span>
                <span><span class="block text-sm font-semibold text-ink">${esc(c.name)}</span><span class="block text-xs text-slate-500">${ui.plural(coursesInCategory(c.id).length, 'program')}</span></span></a>`).join('')}</div></div>
        <div class="border-l pl-6"><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3">Most popular</div>
            <div class="space-y-1">${popular.map(c => `<a href="${courseUrl(c)}" class="block text-sm text-slate-700 hover:text-forest py-1.5">${esc(c.title)}</a>`).join('')}</div>
            <a href="#catalog" onclick="closeExplore(); return go('catalog')" class="inline-block mt-4 text-sm font-semibold text-forest">View all programs <i class="fa-solid fa-arrow-right text-xs ml-1"></i></a></div>`;
    document.getElementById('drawerCats').innerHTML = cats.map(c => `<a href="#catalog" onclick="toggleDrawer(false); return go('catalog', null, {cat:'${c.id}'})" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-ivory"><i class="fa-solid ${esc(c.icon)} w-5 text-forest"></i>${esc(c.name)}</a>`).join('');
    document.getElementById('footerCats').innerHTML = cats.map(c => `<li><a href="#catalog" onclick="return go('catalog', null, {cat:'${c.id}'})" class="hover:text-gold">${esc(c.name)}</a></li>`).join('');
}
function toggleExplore() {
    const m = document.getElementById('exploreMenu'), open = m.classList.toggle('hidden') === false;
    document.getElementById('exploreBtn').setAttribute('aria-expanded', open);
    document.getElementById('exploreChevron').style.transform = open ? 'rotate(180deg)' : '';
}
function closeExplore() { document.getElementById('exploreMenu').classList.add('hidden'); document.getElementById('exploreChevron').style.transform = ''; document.getElementById('exploreBtn').setAttribute('aria-expanded', 'false'); }
function toggleDrawer(open) { document.getElementById('drawer').classList.toggle('hidden', !open); document.body.style.overflow = open ? 'hidden' : ''; }

// Live search suggestions
function searchCourses(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    return lms.listedCourses().map(c => {
        const ins = lms.primaryInstructor(c.id), hay = [c.title, c.shortDescription, lms.categoryName(c.categoryId), lms.categoryName(c.subcategoryId), ins && ins.name].join(' ').toLowerCase();
        const score = c.title.toLowerCase().startsWith(q) ? 3 : c.title.toLowerCase().includes(q) ? 2 : hay.includes(q) ? 1 : 0;
        return { c, score };
    }).filter(x => x.score).sort((a, b) => b.score - a.score).map(x => x.c);
}
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', () => {
    const box = document.getElementById('searchSuggest'), q = searchInput.value, res = searchCourses(q).slice(0, 6);
    if (!q.trim()) return box.classList.add('hidden');
    box.innerHTML = (res.length ? res.map(c => `<a href="${courseUrl(c)}" class="flex items-center gap-3 px-4 py-2.5 hover:bg-ivory">
        <img src="${esc(c.thumbnail)}" alt="" class="w-12 h-9 rounded-lg object-cover bg-slate-100"><span class="min-w-0"><span class="block text-sm font-semibold text-ink truncate">${esc(c.title)}</span><span class="block text-xs text-slate-500">${esc(lms.categoryName(c.categoryId))} · ${esc(c.level)}</span></span></a>`).join('')
        : `<div class="px-4 py-3 text-sm text-slate-500">No programs match "${esc(q)}".</div>`)
        + `<button onclick="submitSearch()" class="w-full text-left px-4 py-2.5 text-sm font-semibold text-forest border-t mt-1 hover:bg-ivory"><i class="fa-solid fa-magnifying-glass mr-2 text-xs"></i>See all results for "${esc(q)}"</button>`;
    box.classList.remove('hidden');
});
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitSearch(); if (e.key === 'Escape') document.getElementById('searchSuggest').classList.add('hidden'); });
document.getElementById('mSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitSearch(true); });
function submitSearch(mobile) {
    const q = document.getElementById(mobile ? 'mSearchInput' : 'searchInput').value;
    document.getElementById('searchSuggest').classList.add('hidden');
    if (mobile) toggleDrawer(false);
    return go('catalog', null, { q, cat: '', level: '', price: '' });
}

// ---------------- Shared course card ----------------
function popularCourses() { return lms.listedCourses().sort((a, b) => db.count('enrollments', { courseId: b.id }) - db.count('enrollments', { courseId: a.id }) || lms.rating(b.id).avg - lms.rating(a.id).avg); }
function priceLabel(c) { return lms.priceOf(c) ? ui.money(lms.priceOf(c)) : 'Free'; }
function courseCard(c, dark) {
    const ins = lms.primaryInstructor(c.id), r = lms.rating(c.id), meta = lms.courseMeta(c.id);
    return `<a href="${courseUrl(c)}" class="group flex flex-col rounded-2xl overflow-hidden ${dark ? 'bg-white text-ink' : 'bg-white border border-slate-200/70'} shadow-luxe hover:shadow-lift hover:-translate-y-1 transition duration-300">
        <div class="relative aspect-[16/9] overflow-hidden bg-slate-100"><img src="${esc(c.thumbnail)}" alt="" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-700">
            <span class="absolute top-3 left-3 pill ${lms.priceOf(c) ? 'bg-white/95 text-ink' : 'bg-gold text-ink'}">${priceLabel(c)}</span></div>
        <div class="p-4 flex-1 flex flex-col">
            <div class="flex items-center gap-2 text-xs text-slate-500"><span class="w-5 h-5 rounded bg-forest text-gold flex items-center justify-center text-[9px]"><i class="fa-solid ${esc((lms.category(c.categoryId) || {}).icon || 'fa-book')}"></i></span><span class="truncate">${esc(ins ? ins.name : 'Tech Oasis Faculty')}</span></div>
            <h3 class="font-semibold text-ink mt-2 leading-snug group-hover:text-forest-600">${esc(c.title)}</h3>
            <p class="text-xs text-slate-500 mt-1 line-clamp-2">${esc(c.shortDescription)}</p>
            <div class="mt-auto pt-3 flex items-center justify-between text-xs text-slate-500">
                <span>${esc(c.level)} · ${meta.hours}h</span>
                ${r.count ? `<span class="flex items-center gap-1 font-semibold text-slate-700"><i class="fa-solid fa-star text-gold"></i>${r.avg.toFixed(1)}</span>` : `<span>${ui.plural(meta.lessons, 'lesson')}</span>`}
            </div>
        </div></a>`;
}
function courseRow(c) {
    const ins = lms.primaryInstructor(c.id), r = lms.rating(c.id);
    return `<a href="${courseUrl(c)}" class="flex gap-4 p-3 rounded-2xl bg-white hover:shadow-luxe transition group">
        <img src="${esc(c.thumbnail)}" alt="" loading="lazy" class="w-24 h-24 rounded-xl object-cover bg-slate-100 shrink-0">
        <div class="min-w-0 py-1">
            <div class="flex items-center gap-2 text-xs text-slate-500"><span class="w-5 h-5 rounded border border-slate-200 flex items-center justify-center text-[9px] text-forest"><i class="fa-solid ${esc((lms.category(c.categoryId) || {}).icon || 'fa-book')}"></i></span><span class="truncate">${esc(ins ? ins.name : 'Tech Oasis Faculty')}</span></div>
            <div class="font-semibold text-ink mt-1.5 leading-snug group-hover:text-forest-600 line-clamp-2">${esc(c.title)}</div>
            <div class="text-xs text-slate-500 mt-1.5">${lms.priceOf(c) ? 'Career Program' : 'Free Course'}${r.count ? ` · <i class="fa-solid fa-star text-gold"></i> <b class="text-slate-700">${r.avg.toFixed(1)}</b>` : ''}</div>
        </div></a>`;
}

// ---------------- Hero carousel ----------------
let heroIdx = 0, heroTimer = null, heroPaused = false;
function renderHero() {
    const pick = slug => lms.courseBySlug(slug) || popularCourses()[0];
    const web = pick('web-development'), aiC = pick('artificial-intelligence-ai'), free = lms.listedCourses().find(c => !lms.priceOf(c)) || pick('coding');
    const slides = [
        { tag: 'Admissions open', title: 'Learn the skills shaping tomorrow, from people who build it', body: 'Career programs in software, AI, data, design and cloud, with structured lessons, real projects and verified certificates.', cta: ['Explore programs', "go('catalog')"], img: 'photo-1523240795612-9a054b0db644',
          side: { c: web, eyebrow: 'Flagship program', title: 'Go from first line of code to a deployed website' } },
        { tag: 'Artificial Intelligence', title: 'Put AI to work in your career, responsibly and confidently', body: 'Understand how modern AI works, write effective prompts and integrate AI into real products.', cta: ['Explore AI programs', "go('catalog', null, {q:'AI'})"], img: 'photo-1531482615713-2afd69097998',
          side: { c: aiC, eyebrow: 'Trending now', title: 'Generative AI, from fundamentals to integration' } },
        { tag: 'Start free', title: 'Your first lesson is on us', body: 'Preview any program for free, then start a 7-day free trial when you are ready to commit.', cta: ['Join for free', "location.href='/student/register'"], img: 'photo-1522071820081-009f0129c71c',
          side: { c: free, eyebrow: 'Free course', title: 'Learn to think like a programmer' } }
    ];
    document.getElementById('heroTrack').innerHTML = slides.map((s, i) => `
        <div class="w-full shrink-0 grid lg:grid-cols-[1.45fr_1fr] gap-4" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}">
            <div class="relative overflow-hidden rounded-[28px] bg-ink text-white min-h-[400px] sm:min-h-[440px] flex items-center grain">
                <img src="https://images.unsplash.com/${s.img}?auto=format&fit=crop&w=1400&q=70" alt="" class="absolute inset-0 w-full h-full object-cover opacity-45" ${i ? 'loading="lazy"' : ''}>
                <div class="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/10"></div>
                <div class="absolute -left-20 -bottom-24 w-80 h-80 rounded-full bg-gold/15 blur-3xl"></div>
                <div class="relative p-8 sm:p-12 max-w-xl">
                    <span class="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-gold"><span class="w-6 h-px bg-gold"></span>${esc(s.tag)}</span>
                    <h1 class="font-display text-[34px] sm:text-5xl leading-[1.08] mt-4">${esc(s.title)}</h1>
                    <p class="text-white/75 mt-4 text-[15px] leading-relaxed">${esc(s.body)}</p>
                    <button onclick="${s.cta[1]}" class="btn btn-gold mt-7 h-12 px-6">${esc(s.cta[0])} <i class="fa-solid fa-arrow-right text-xs"></i></button>
                </div>
            </div>
            ${s.side.c ? `<a href="${courseUrl(s.side.c)}" class="hidden lg:flex relative overflow-hidden rounded-[28px] bg-gradient-to-br from-gold-50 via-ivory to-gold-100 border border-gold-200 p-9 flex-col justify-between group">
                <div class="absolute -right-10 -top-10 w-48 h-48 rounded-full border-[18px] border-gold/20"></div>
                <div class="relative"><div class="flex items-center gap-2 text-sm text-slate-600">${ui.logoMark(22)}<span class="font-semibold">Tech Oasis School</span></div>
                    <div class="text-[11px] font-bold uppercase tracking-[0.25em] text-gold-600 mt-6">${esc(s.side.eyebrow)}</div>
                    <h2 class="font-display text-[28px] leading-tight text-ink mt-2">${esc(s.side.title)}</h2>
                    <p class="text-sm text-slate-600 mt-3 line-clamp-3">${esc(s.side.c.shortDescription)}</p></div>
                <div class="relative flex items-end justify-between gap-4">
                    <span class="btn btn-forest group-hover:bg-forest-600">${lms.priceOf(s.side.c) ? 'Enroll now' : 'Start free'} <i class="fa-solid fa-arrow-right text-xs"></i></span>
                    <img src="${esc(s.side.c.thumbnail)}" alt="" class="w-32 h-24 rounded-2xl object-cover shadow-luxe rotate-3 group-hover:rotate-0 transition"></div>
            </a>` : ''}
        </div>`).join('');
    document.getElementById('heroDots').innerHTML = slides.map((_, i) => `<button onclick="heroGo(${i}, true)" class="hero-dot h-2 rounded-full transition-all" aria-label="Go to slide ${i + 1}"></button>`).join('');
    heroGo(0, true);
    clearInterval(heroTimer);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) heroTimer = setInterval(() => { if (!heroPaused && !document.hidden) heroGo(1); }, 7000);
}
function heroGo(n, absolute) {
    const count = document.getElementById('heroTrack').children.length;
    heroIdx = absolute ? n : (heroIdx + n + count) % count;
    document.getElementById('heroTrack').style.transform = `translateX(-${heroIdx * 100}%)`;
    ui.$$('.hero-dot').forEach((d, i) => { d.className = 'hero-dot h-2 rounded-full transition-all ' + (i === heroIdx ? 'w-8 bg-ink' : 'w-2 bg-slate-300 hover:bg-slate-400'); d.setAttribute('aria-current', i === heroIdx); });
}
const heroPause = p => { heroPaused = p; };
// Swipe on touch screens
(() => { let x0 = null; const h = document.getElementById('hero'); h.addEventListener('touchstart', e => x0 = e.touches[0].clientX, { passive: true }); h.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) heroGo(dx < 0 ? 1 : -1); x0 = null; }); })();

// ---------------- Homepage sections ----------------
function renderPopular() {
    const all = lms.listedCourses();
    const isAi = c => [c.categoryId, c.subcategoryId].some(id => /ai|data|machine/i.test(lms.categoryName(id)));
    const cols = [
        ['Most popular', popularCourses().slice(0, 3), "go('catalog', null, {sort:'popular'})"],
        ['New releases', all.slice().sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt)).slice(0, 3), "go('catalog', null, {sort:'newest'})"],
        ['Trending in AI & Data', all.filter(isAi).sort((a, b) => db.count('enrollments', { courseId: b.id }) - db.count('enrollments', { courseId: a.id })).slice(0, 3), "go('catalog', null, {q:'AI'})"]
    ];
    document.getElementById('popularCols').innerHTML = cols.map(([t, list, act]) => `
        <div class="rounded-3xl bg-forest-50/70 border border-forest-100 p-4 sm:p-5">
            <button onclick="${act}" class="flex items-center gap-2 font-semibold text-ink hover:text-forest-600 px-1 mb-3">${t} <i class="fa-solid fa-arrow-right text-xs"></i></button>
            <div class="space-y-3">${list.map(courseRow).join('') || '<p class="text-sm text-slate-500 p-3">Coming soon.</p>'}</div>
        </div>`).join('');
}
function renderPromo() {
    const c = lms.courseBySlug('artificial-intelligence-ai') || popularCourses()[0]; if (!c) return;
    document.getElementById('promoAi').innerHTML = `
        <div class="absolute right-0 bottom-0 w-[42%] h-full hidden sm:block"><img src="${esc(c.thumbnail)}" alt="" class="absolute right-6 bottom-6 w-[85%] max-w-[220px] aspect-[4/3] object-cover rounded-2xl shadow-lift rotate-2"><span class="absolute left-0 top-10 w-14 h-14 rounded-full bg-forest text-gold flex items-center justify-center shadow-lift text-xl"><i class="fa-solid fa-wand-magic-sparkles"></i></span></div>
        <div class="relative sm:max-w-[55%]"><div class="flex items-center gap-2 text-sm font-semibold text-slate-600">${ui.logoMark(22)} Tech Oasis AI</div>
            <h3 class="font-display text-3xl sm:text-[34px] leading-tight text-ink mt-4">From prompt to production with applied AI</h3>
            <p class="text-sm text-slate-600 mt-3">${esc(c.shortDescription)}</p></div>
        <a href="${courseUrl(c)}" class="relative btn btn-outline border-forest text-forest self-start mt-6">Enroll now <i class="fa-solid fa-arrow-right text-xs"></i></a>`;
}
const TOOLS = [['fa-brands fa-html5', 'HTML & CSS', 'web'], ['fa-brands fa-js', 'JavaScript', 'javascript'], ['fa-brands fa-python', 'Python', 'python'], ['fa-brands fa-react', 'React', 'react'], ['fa-brands fa-figma', 'Figma', 'figma'], ['fa-brands fa-aws', 'AWS', 'aws'], ['fa-brands fa-docker', 'Docker', 'devops'], ['fa-solid fa-database', 'SQL', 'sql'], ['fa-brands fa-git-alt', 'Git', 'coding'], ['fa-brands fa-ethereum', 'Solidity', 'solidity'], ['fa-solid fa-brain', 'Machine Learning', 'machine learning'], ['fa-brands fa-google', 'SEO', 'seo']];
function renderTools() {
    document.getElementById('toolStrip').innerHTML = TOOLS.map(([ic, name, q]) => `<button onclick="go('catalog', null, {q:'${q}', cat:''})" class="shrink-0 flex items-center gap-3 rounded-full bg-white border border-slate-200 px-5 h-14 hover:border-forest hover:shadow-luxe transition"><i class="${ic} text-lg text-forest"></i><span class="text-sm font-semibold text-ink whitespace-nowrap">${name}</span></button>`).join('');
}
const PATHS = [
    ['Web Developer', ['web-development', 'web-design', 'coding', 'app-development']],
    ['AI Engineer', ['artificial-intelligence-ai', 'machine-learning', 'data-science', 'coding']],
    ['Data Analyst', ['data-science', 'machine-learning', 'coding', 'digital-marketing']],
    ['Product Designer', ['ui-ux-design', 'web-design', 'web-development', 'digital-marketing']],
    ['Cloud & Security', ['cloud-computing', 'cybersecurity', 'blockchain', 'coding']],
    ['Digital Marketer', ['digital-marketing', 'web-design', 'data-science', 'ui-ux-design']]
];
let pathIdx = 0;
function renderPaths() {
    document.getElementById('pathTabs').innerHTML = PATHS.map(([t], i) => `<button role="tab" aria-selected="${i === pathIdx}" onclick="pathIdx=${i}; renderPaths()" class="shrink-0 h-10 px-5 rounded-full text-sm font-semibold transition ${i === pathIdx ? 'bg-white text-ink' : 'bg-white/10 text-white hover:bg-white/20 border border-white/15'}">${t}</button>`).join('');
    const list = PATHS[pathIdx][1].map(s => lms.courseBySlug(s)).filter(c => c && c.status === 'published');
    document.getElementById('pathCards').innerHTML = list.map(c => courseCard(c, true)).join('');
}
const GOALS = [['fa-rocket', 'Start my career', c => c.level === 'Beginner'], ['fa-shuffle', 'Change my career', c => c.level !== 'Advanced'], ['fa-arrow-trend-up', 'Grow in my current role', c => c.level !== 'Beginner'], ['fa-binoculars', 'Explore new topics', () => true]];
let goalIdx = 0;
function renderGoals() {
    document.getElementById('goalChips').innerHTML = GOALS.map(([ic, t], i) => `<button onclick="goalIdx=${i}; renderGoals()" aria-pressed="${i === goalIdx}" class="flex items-center gap-3 h-12 pl-1.5 pr-5 rounded-xl border text-sm font-semibold transition ${i === goalIdx ? 'border-forest bg-forest-50 text-forest' : 'border-slate-200 bg-white text-ink hover:border-forest'}">
        <span class="w-9 h-9 rounded-lg ${i === goalIdx ? 'bg-forest text-gold' : 'bg-forest-50 text-forest'} flex items-center justify-center"><i class="fa-solid ${ic}"></i></span>${t}</button>`).join('');
    const list = popularCourses().filter(GOALS[goalIdx][2]);
    const shuffled = goalIdx === 3 ? list.slice().sort((a, b) => a.title.localeCompare(b.title)) : list;
    document.getElementById('goalCards').innerHTML = shuffled.slice(0, 4).map(c => courseCard(c)).join('');
}
let catTab = null;
function renderCatTabs() {
    const cats = topCategories().filter(c => coursesInCategory(c.id).length);
    if (!catTab && cats[0]) catTab = cats[0].id;
    document.getElementById('catTabs').innerHTML = cats.map(c => `<button role="tab" aria-selected="${c.id === catTab}" onclick="catTab='${c.id}'; renderCatTabs()" class="shrink-0 h-10 px-4 rounded-full text-sm font-semibold transition ${c.id === catTab ? 'bg-ink text-white' : 'bg-white text-ink border border-slate-200 hover:border-ink'}">${esc(c.name)}</button>`).join('');
    document.getElementById('catCards').innerHTML = coursesInCategory(catTab).slice(0, 4).map(c => courseCard(c)).join('');
}
function renderReviews() {
    const rs = db.where('reviews', r => r.status === 'published' && r.comment).sort((a, b) => b.rating - a.rating || new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3);
    document.getElementById('reviewsSection').classList.toggle('hidden', !rs.length);
    const all = db.where('reviews', r => r.status === 'published'), avg = all.length ? all.reduce((a, r) => a + r.rating, 0) / all.length : 0;
    document.getElementById('reviewSummary').innerHTML = all.length ? `<span class="text-gold">${ui.stars(avg)}</span> <b class="text-white ml-1">${avg.toFixed(1)}</b> average from ${ui.plural(all.length, 'review')}` : '';
    document.getElementById('reviewCards').innerHTML = rs.map(r => {
        const u = db.get('users', r.userId), c = db.get('courses', r.courseId);
        return `<figure class="rounded-3xl bg-white/5 border border-white/10 p-7 flex flex-col">
            <div class="text-gold text-sm">${ui.stars(r.rating)}</div>
            <blockquote class="font-display text-xl leading-snug mt-4 flex-1">“${esc(r.comment)}”</blockquote>
            <figcaption class="flex items-center gap-3 mt-6"><span class="w-10 h-10 rounded-full bg-gold text-ink text-xs font-bold flex items-center justify-center">${esc(ui.initials(u ? u.name : '?'))}</span>
                <span><span class="block text-sm font-semibold">${esc(u ? u.name : 'Learner')}</span><span class="block text-xs text-white/50">${esc(c ? c.title : '')}</span></span></figcaption></figure>`;
    }).join('');
}
function renderFaq() {
    const p = db.settings().payments;
    const faqs = [
        ['How much does a program cost?', `Each career program is a one-time ${ui.money(p.defaultPrice)}, with a ${p.trialDays}-day free trial. Some courses are completely free.`],
        ['How are courses structured?', 'Every course is organised into sections, and each section into short lessons: videos, readings, quizzes, assignments and downloadable resources. Your progress is saved automatically.'],
        ['Do I get a certificate?', 'Yes. Complete the lessons, pass the quizzes and have your assignments graded, and you can claim a verified certificate with a unique ID and a public verification link.'],
        ['Can I learn at my own pace?', 'Absolutely. Lessons are available whenever you are, on any device, and you can pick up exactly where you left off.'],
        ['I need help. Who do I contact?', `Email our student support team at ${db.settings().school.studentEmail}. For admissions or organisation enquiries, email ${db.settings().school.email}.`]
    ];
    document.getElementById('faq').innerHTML = faqs.map(([q, a]) => `<details class="group py-5"><summary class="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold text-ink">${esc(q)}<span class="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center shrink-0 group-open:rotate-45 transition"><i class="fa-solid fa-plus text-xs"></i></span></summary><p class="text-slate-600 text-sm mt-3 pr-12">${esc(a)}</p></details>`).join('');
    document.getElementById('priceFlat').textContent = ui.money(p.defaultPrice);
    document.getElementById('trialLine').textContent = p.trialDays ? p.trialDays + '-day free trial' : 'Instant access';
}
function subscribe(e) {
    e.preventDefault();
    const el = document.getElementById('newsEmail'), email = el.value.trim().toLowerCase();
    if (!db.first('subscribers', { email })) db.insert('subscribers', { email, source: 'homepage' });
    el.value = ''; ui.toast("You're subscribed. Welcome to Tech Oasis!");
}

// ---------------- Catalog ----------------
const catalogState = { q: '', cat: '', level: '', price: '', sort: 'popular' };
function renderCatalog() {
    const s = catalogState, cats = topCategories();
    document.getElementById('catSearch').value = s.q || '';
    document.getElementById('catSort').value = s.sort;
    const chip = (on, label, act) => `<button onclick="${act}" class="h-9 px-3.5 rounded-full text-xs font-semibold border transition ${on ? 'bg-forest text-white border-forest' : 'bg-white border-slate-200 hover:border-forest'}">${label}</button>`;
    document.getElementById('filterCats').innerHTML = [['', 'All categories', 'fa-border-all']].concat(cats.map(c => [c.id, c.name, c.icon])).map(([id, n, ic]) =>
        `<button onclick="catalogState.cat='${id}'; renderCatalog()" class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-left ${s.cat === id ? 'bg-forest-50 text-forest font-semibold' : 'hover:bg-white text-slate-700'}"><i class="fa-solid ${esc(ic)} w-4 text-forest-400"></i><span class="flex-1">${esc(n)}</span><span class="text-xs text-slate-400">${id ? coursesInCategory(id).length : lms.listedCourses().length}</span></button>`).join('');
    document.getElementById('filterLevels').innerHTML = ['', ...db.settings().courses.levels].map(l => chip(s.level === l, l || 'Any', `catalogState.level='${l}'; renderCatalog()`)).join('');
    document.getElementById('filterPrice').innerHTML = [['', 'Any'], ['free', 'Free'], ['paid', 'Paid']].map(([v, l]) => chip(s.price === v, l, `catalogState.price='${v}'; renderCatalog()`)).join('');

    let list = s.q ? searchCourses(s.q) : lms.listedCourses();
    if (s.cat) list = list.filter(c => c.categoryId === s.cat || c.subcategoryId === s.cat);
    if (s.level) list = list.filter(c => c.level === s.level);
    if (s.price) list = list.filter(c => (s.price === 'free') === !lms.priceOf(c));
    const enr = id => db.count('enrollments', { courseId: id });
    if (s.sort === 'popular' && !s.q) list.sort((a, b) => enr(b.id) - enr(a.id));
    if (s.sort === 'newest') list.sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
    if (s.sort === 'rating') list.sort((a, b) => lms.rating(b.id).avg - lms.rating(a.id).avg);
    if (s.sort === 'az') list.sort((a, b) => a.title.localeCompare(b.title));
    document.getElementById('catalogLead').textContent = `${lms.listedCourses().length} programs across ${cats.length} categories, each built section by section with projects and certificates.`;
    document.getElementById('catalogCount').innerHTML = `<b class="text-ink">${list.length}</b> ${list.length === 1 ? 'result' : 'results'}${s.q ? ` for "<b class="text-ink">${esc(s.q)}</b>"` : ''}`;
    document.getElementById('catalogGrid').innerHTML = list.map(c => courseCard(c)).join('') || `<div class="sm:col-span-2 xl:col-span-3 text-center py-16 bg-white rounded-3xl border border-dashed"><i class="fa-solid fa-magnifying-glass text-3xl text-slate-300"></i><p class="font-semibold text-ink mt-3">No programs match these filters</p><button onclick="Object.assign(catalogState,{q:'',cat:'',level:'',price:''}); renderCatalog()" class="btn btn-outline btn-sm mt-4">Clear filters</button></div>`;
}
document.getElementById('catSearch').addEventListener('input', e => { catalogState.q = e.target.value; renderCatalog(); document.getElementById('catSearch').focus(); });
document.getElementById('catSort').addEventListener('change', e => { catalogState.sort = e.target.value; renderCatalog(); });

function renderAbout() {
    document.getElementById('aboutInstructors').innerHTML = db.all('instructors').filter(i => db.count('course_instructors', { instructorId: i.id })).map(i => `
        <div class="bg-white rounded-3xl border border-slate-200/70 p-6 shadow-luxe">
            <div class="flex items-center gap-4">${i.avatar ? `<img src="${esc(i.avatar)}" alt="" class="w-16 h-16 rounded-2xl object-cover">` : `<span class="w-16 h-16 rounded-2xl bg-forest text-gold flex items-center justify-center font-bold">${esc(ui.initials(i.name))}</span>`}
            <div><div class="font-display text-lg text-ink">${esc(i.name)}</div><div class="text-xs text-gold-600 font-semibold">${esc(i.title)}</div></div></div>
            <p class="text-sm text-slate-600 mt-4">${esc(i.bio)}</p>
            <p class="text-xs text-slate-400 mt-3">${ui.plural(db.count('course_instructors', { instructorId: i.id }), 'program')}</p></div>`).join('');
}

// Contact emails come from School Settings
function applyEmails() {
    const st = db.settings().school, map = { school: st.email, students: st.studentEmail };
    ui.$$('[data-email]').forEach(a => {
        const addr = map[a.dataset.email]; if (!addr) return;
        a.href = 'mailto:' + addr + (a.dataset.subject ? '?subject=' + encodeURIComponent(a.dataset.subject) : '');
        const t = a.querySelector('[data-email-text]'); if (t) t.textContent = addr;
    });
}

function renderHome() {
    renderExplore(); renderHero(); renderPopular(); renderPromo(); renderTools(); renderPaths(); renderGoals(); renderCatTabs(); renderReviews(); renderFaq();
    document.getElementById('certLogo').innerHTML = ui.brandLogo(false, 40);
}

// ---------------- Boot ----------------
window.addEventListener('load', () => setTimeout(() => { const p = document.getElementById('preloader'); p.style.opacity = '0'; setTimeout(() => p.remove(), 700); }, sessionStorage.getItem('tos_seen') ? 300 : 1600));
sessionStorage.setItem('tos_seen', '1');
document.getElementById('year').textContent = new Date().getFullYear();
// Boot after every script (including portal.js, which defines the sign-in modal) has loaded
document.addEventListener('DOMContentLoaded', function route() {
    ui.applyBrandLogos(); applyEmails(); renderHome();
    const h = location.hash.slice(1), p = ui.qs('login');
    if (p === 'student') { location.replace('/student/' + (ui.qs('mode') === 'register' ? 'register' : 'login') + (ui.qs('next') ? '?next=' + encodeURIComponent('/' + ui.qs('next').replace(/^\/+/, '')) : '')); return; }
    if (p) { openCourseraAuthModal('staff'); return showPage('home'); }
    if (PUBLIC_PAGES.includes(h)) return showPage(h);
    if (h === 'my-learning' || h === 'portal') return auth.current() ? goToPortal() : showPage('home');
    showPage('home');
    if (h && document.getElementById(h)) setTimeout(() => document.getElementById(h).scrollIntoView(), 100);
});
db.onChange(() => { if (!document.getElementById('page-home').classList.contains('hidden')) { renderPopular(); renderReviews(); } });
