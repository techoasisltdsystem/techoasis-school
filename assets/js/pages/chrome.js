// Compact header + footer shared by sub-pages (course landing, certificate verification).
(function () {
    const { ui, auth, db } = TOS, esc = ui.esc;
    function header() {
        const me = auth.current(), here = encodeURIComponent(location.pathname.split('/').pop() + location.search);
        return `<header class="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200/70 no-print">
            <div class="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 h-[68px] flex items-center gap-6">
                <a href="index.html" aria-label="Tech Oasis School home">${ui.brandLogo(false, 38)}</a>
                <nav class="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-700">
                    <a href="index.html#catalog" class="hover:text-forest">Programs</a><a href="index.html#about" class="hover:text-forest">About</a><a href="verify.html" class="hover:text-forest">Verify a certificate</a></nav>
                <div class="ml-auto flex items-center gap-3">${me
                    ? `<a href="${me.role === 'student' ? '/student/dashboard' : 'index.html#my-learning'}" class="btn btn-outline btn-sm"><span class="w-6 h-6 -ml-1 rounded-full bg-forest text-gold text-[10px] font-bold flex items-center justify-center">${esc(ui.initials(me.name))}</span>${me.role === 'staff' ? 'Instructor Hub' : 'My Learning'}</a>`
                    : `<a href="/student/login?next=${encodeURIComponent('/' + decodeURIComponent(here))}" class="text-sm font-semibold text-forest">Log In</a><a href="/student/register?next=${encodeURIComponent('/' + decodeURIComponent(here))}" class="btn btn-outline btn-sm border-forest text-forest">Join for Free</a>`}</div>
            </div></header>`;
    }
    function footer() {
        const st = db.settings().school;
        return `<footer class="bg-ink text-white/60 mt-20 no-print"><div class="hairline-gold"></div>
            <div class="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row gap-6 items-center justify-between text-sm">
                <a href="index.html">${ui.brandLogo(true, 36)}</a>
                <div class="flex flex-wrap justify-center gap-x-6 gap-y-2"><a href="mailto:${esc(st.email)}" class="hover:text-gold">${esc(st.email)}</a><a href="mailto:${esc(st.studentEmail)}" class="hover:text-gold">${esc(st.studentEmail)}</a></div>
                <p class="text-xs text-white/40">&copy; ${new Date().getFullYear()} ${esc(st.name)}</p></div></footer>`;
    }
    TOS.chrome = { mount() { const h = document.getElementById('siteHeader'), f = document.getElementById('siteFooter'); if (h) h.outerHTML = header(); if (f) f.outerHTML = footer(); } };
})();
