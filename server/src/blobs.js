'use strict';
// Large uploaded files (application documents, photos, avatars) are stored inside their records as data URLs.
// Sending them with every page load would make pages heavy, so any big one is replaced in what browsers receive by a
// link ( /api/blob/<table>/<id>/<path> ) that the server answers on request, after checking who is asking.
//   - The administrator can open any file.
//   - Other people can open only files belonging to things they may already see (a published programme's picture,
//     an active instructor's photo, a free-preview lesson's file, their own account's avatar).
// When the administrator's screens send a record back, links are turned back into the real files, so nothing is lost.

const BIG = 20000;                                  // characters; smaller files stay inside the record
const LINK = /^\/api\/blob\/([a-z_]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)$/;
const SEGMENT = /^[A-Za-z0-9_-]+$/;

// Replaces big data URLs inside a (cloned) row. Returns the same row.
function externalize(table, row) {
    const walk = (node, path, depth) => {
        if (!node || typeof node !== 'object' || depth > 5) return;
        for (const k of Object.keys(node)) {
            const v = node[k], here = path.concat(k);
            if (typeof v === 'string') {
                if (v.length > BIG && v.startsWith('data:') && SEGMENT.test(String(row.id)) && here.every(s => SEGMENT.test(String(s)))) node[k] = `/api/blob/${table}/${row.id}/${here.join('.')}`;
            } else walk(v, here, depth + 1);
        }
    };
    walk(row, [], 0);
    return row;
}

function getAt(obj, path) {
    return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

// Turns links back into the real data URLs (used on what the administrator's screens send back)
function restore(engine, value, depth = 0) {
    if (typeof value === 'string') {
        const m = LINK.exec(value);
        if (!m) return value;
        const row = (engine.raw().tables[m[1]] || []).find(r => r.id === m[2]);
        const real = row && getAt(row, m[3]);
        return typeof real === 'string' && real.startsWith('data:') ? real : value;
    }
    if (!value || typeof value !== 'object' || depth > 6) return value;
    for (const k of Object.keys(value)) value[k] = restore(engine, value[k], depth + 1);
    return value;
}

// The record a file belongs to, if this person may open it
function recordFor(engine, session, table, id) {
    const T = engine.raw().tables, row = (T[table] || []).find(r => r.id === id);
    if (!row) return null;
    if (session && session.role === 'admin') return row;
    switch (table) {
        case 'instructors': return row.active !== false ? row : null;
        case 'courses': return row.status === 'published' ? row : null;
        case 'categories': return row;
        case 'users': return session && session.userId === id ? row : null;
        case 'contents': { const l = T.lessons.find(x => x.id === row.lessonId); return l && l.isPreview && l.status === 'published' ? row : null; }
        default: return null;
    }
}

const SAFE_INLINE = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg)|text\/plain)$/i;
function decode(dataUrl) {
    const m = /^data:([^;,]*)((?:;[^,]*)*),(.*)$/s.exec(dataUrl || '');
    if (!m) return null;
    const mime = (m[1] || 'application/octet-stream').toLowerCase(), isB64 = /;base64/i.test(m[2]);
    const buffer = isB64 ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
    return { mime, buffer, inline: SAFE_INLINE.test(mime) };
}

module.exports = { externalize, restore, recordFor, getAt, decode, LINK };
