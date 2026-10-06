// Shared UI helpers used by every page. Exposes window.TOS.ui (and a few short globals for templates).
(function () {
    const TOS = window.TOS = window.TOS || {};

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const initials = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
    const qs = (k, url) => new URLSearchParams(url || location.search).get(k);
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    function fmtDuration(min) {
        min = Math.round(min || 0);
        if (min < 60) return min + ' min';
        const h = Math.floor(min / 60), m = min % 60;
        return h + 'h' + (m ? ' ' + m + 'm' : '');
    }
    const fmtSecs = s => { s = Math.max(0, Math.round(s || 0)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
    const fmtDate = (d, opts) => d ? new Date(d).toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const fmtDateTime = d => d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const fmtBytes = b => { if (!b) return '—'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return b.toFixed(i ? 1 : 0) + ' ' + u[i]; };
    function timeAgo(ts) {
        const s = (Date.now() - new Date(ts)) / 1000;
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        const d = Math.floor(s / 86400);
        return d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : fmtDate(ts);
    }
    function money(n, currency) {
        const cur = currency || (TOS.db && TOS.db.settings().payments.currency) || 'USD';
        try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0); }
        catch (e) { return '$' + (n || 0); }
    }
    function stars(r, cls) {
        r = r || 0; let h = '';
        for (let i = 1; i <= 5; i++) {
            const icon = r >= i - .25 ? 'fa-solid fa-star' : r >= i - .75 ? 'fa-solid fa-star-half-stroke' : 'fa-regular fa-star';
            h += `<i class="${icon} ${cls || 'text-gold'}" aria-hidden="true"></i>`;
        }
        return h;
    }
    const plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));

    // Lesson content-type metadata (icon + label), shared by builder, player and landing page
    const LESSON_TYPES = {
        video: { label: 'Video', icon: 'fa-circle-play' },
        article: { label: 'Article', icon: 'fa-file-lines' },
        document: { label: 'PDF / Document', icon: 'fa-file-pdf' },
        quiz: { label: 'Quiz', icon: 'fa-circle-question' },
        assignment: { label: 'Assignment', icon: 'fa-file-pen' },
        download: { label: 'Downloadable resource', icon: 'fa-download' },
        external: { label: 'External resource', icon: 'fa-arrow-up-right-from-square' }
    };

    // Very small, safe Markdown renderer for lesson bodies: escapes HTML first, then applies formatting.
    function md(src) {
        if (!src) return '';
        const blocks = [];
        let s = String(src).replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => { blocks.push('<pre><code>' + esc(code.replace(/\n$/, '')) + '</code></pre>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
        s = esc(s);
        const inline = t => t
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        return s.split(/\n{2,}/).map(par => {
            const t = par.trim();
            if (!t) return '';
            const ph = t.match(/^\u0000(\d+)\u0000$/); if (ph) return blocks[+ph[1]];
            const h = t.match(/^(#{1,3})\s+(.*)$/); if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
            if (/^&gt;\s?/.test(t)) return '<blockquote>' + inline(t.replace(/^&gt;\s?/gm, '')) + '</blockquote>';
            const lines = t.split('\n');
            if (lines.every(l => /^\s*[-*]\s+/.test(l))) return '<ul>' + lines.map(l => '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>').join('') + '</ul>';
            if (lines.every(l => /^\s*\d+\.\s+/.test(l))) return '<ol>' + lines.map(l => '<li>' + inline(l.replace(/^\s*\d+\.\s+/, '')) + '</li>').join('') + '</ol>';
            return '<p>' + inline(t).replace(/\n/g, '<br>') + '</p>';
        }).join('').replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
    }

    function toast(msg, kind) {
        const t = document.createElement('div');
        const tone = kind === 'error' ? 'bg-rose-700' : 'bg-ink';
        t.className = `toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] ${tone} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lift flex items-center gap-2 max-w-[90vw]`;
        t.setAttribute('role', 'status');
        t.innerHTML = `<i class="fa-solid ${kind === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'} ${kind === 'error' ? '' : 'text-gold'}"></i><span></span>`;
        t.lastChild.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2800);
    }

    // Generic modal: returns { el, close }. `body` is HTML; buttons wired by caller via el.
    function modal({ title, body, size, onClose }) {
        const wrap = document.createElement('div');
        wrap.className = 'fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-4 bg-ink/60 backdrop-blur-sm overflow-y-auto';
        wrap.innerHTML = `<div role="dialog" aria-modal="true" class="bg-white rounded-2xl shadow-lift w-full ${size || 'max-w-lg'} my-8 relative">
            <div class="flex items-center justify-between px-6 pt-5 pb-3"><h3 class="font-display text-xl text-ink">${esc(title || '')}</h3>
            <button data-close class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="px-6 pb-6" data-body>${body || ''}</div></div>`;
        const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
        const onKey = e => { if (e.key === 'Escape') close(); };
        wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
        wrap.querySelector('[data-close]').onclick = close;
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
        const first = wrap.querySelector('input,select,textarea'); if (first) setTimeout(() => first.focus(), 30);
        return { el: wrap, body: wrap.querySelector('[data-body]'), close };
    }

    function confirmBox(message, { okText, danger } = {}) {
        return new Promise(res => {
            const m = modal({ title: 'Please confirm', body: `<p class="text-sm text-slate-600">${esc(message)}</p>
                <div class="flex justify-end gap-2 mt-6"><button data-no class="btn btn-outline btn-sm">Cancel</button><button data-yes class="btn ${danger ? 'btn-danger' : 'btn-forest'} btn-sm">${esc(okText || 'Confirm')}</button></div>`, size: 'max-w-md', onClose: () => res(false) });
            m.el.querySelector('[data-no]').onclick = () => m.close();
            m.el.querySelector('[data-yes]').onclick = () => { res(true); m.el.remove(); };
        });
    }

    // Brand mark (Tech Oasis logo). dark=true for use on dark surfaces.
    function logoMark(size, dark) {
        const main = dark ? '#3A8D7C' : '#225A50';
        return `<svg viewBox="16 12 496 606" width="${size * .81}" height="${size}" role="img" aria-label="Tech Oasis School" class="shrink-0">
            <polygon points="255,17 303,46 303,229 250,198 250,100 78,200 78,522 22,490 22,160" fill="${main}"/>
            <polygon points="125,225 213,176 213,238 179,258 179,583 125,551" fill="${main}"/>
            <polygon points="352,78 405,106 405,386 228,493 228,383 268,404 352,350" fill="${main}"/>
            <polygon points="452,140 505,166 505,446 232,612 232,545 452,410" fill="${main}"/>
            <polygon points="207,272 270,236 335,272 270,308" fill="#DEC45B"/><polygon points="207,272 270,308 270,372 207,338" fill="#AC903F"/><polygon points="270,308 335,272 335,338 270,372" fill="#937733"/></svg>`;
    }
    function brandLogo(dark, size) {
        return `<span class="inline-flex items-center gap-3">${logoMark(size || 38, dark)}
            <span class="leading-none"><span class="block text-[15px] font-extrabold tracking-[0.08em] ${dark ? 'text-white' : 'text-ink'}">TECH <span class="gold-text">OASIS</span></span>
            <span class="block text-[9px] font-semibold tracking-[0.32em] uppercase mt-1 ${dark ? 'text-forest-200' : 'text-slate-500'}">School</span></span></span>`;
    }
    const applyBrandLogos = () => $$('.brand-logo').forEach(el => { el.innerHTML = brandLogo(el.dataset.theme === 'dark', +el.dataset.size || 38); });

    // Fade-up reveal for elements with .reveal
    function initReveal(root) {
        const els = $$('.reveal:not(.in)', root);
        if (!('IntersectionObserver' in window)) return els.forEach(e => e.classList.add('in'));
        const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
        els.forEach(e => io.observe(e));
    }

    // Read a File as a data URL (used by the demo storage adapter for small uploads)
    const readFile = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

    // Single shared tooltip for charts
    let tipEl;
    function chartTip(e, html) {
        if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
        if (!html) { tipEl.style.display = 'none'; return; }
        tipEl.innerHTML = html; tipEl.style.display = 'block';
        tipEl.style.left = e.clientX + 'px'; tipEl.style.top = e.clientY + 'px';
    }

    TOS.ui = { esc, initials, qs, $, $$, fmtDuration, fmtSecs, fmtDate, fmtDateTime, fmtBytes, timeAgo, money, stars, plural, md, toast, modal, confirmBox, logoMark, brandLogo, applyBrandLogos, initReveal, readFile, chartTip, LESSON_TYPES };
})();
