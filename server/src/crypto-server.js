// Runs inside the engine in place of assets/js/core/crypto.js (same names), using Node's native crypto.
// Passwords: scrypt (memory-hard, salted). Tokens: random, only their SHA-256 is ever stored.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const N = window.__nodeCrypto;
    const COST = 16384, R = 8, P = 1, KEYLEN = 64, MAXMEM = 64 * 1024 * 1024;

    function hashPassword(password) {
        const salt = N.randomBytes(16);
        const h = N.scryptSync(String(password), salt, KEYLEN, { N: COST, r: R, p: P, maxmem: MAXMEM });
        return ['scrypt', COST, R, P, salt.toString('base64'), h.toString('base64')].join('$');
    }
    function verifyPassword(password, stored) {
        try {
            if (!password || typeof stored !== 'string') return false;
            const [alg, n, r, p, salt, hash] = stored.split('$');
            if (alg !== 'scrypt' || !salt || !hash) return false;
            const expected = Buffer.from(hash, 'base64');
            const calc = N.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p, maxmem: MAXMEM });
            return calc.length === expected.length && N.timingSafeEqual(calc, expected);
        } catch (e) { return false; }
    }
    const sha256 = s => N.createHash('sha256').update(String(s)).digest('hex');
    TOS.crypto = {
        sha256, hashPassword, verifyPassword,
        token: () => N.randomBytes(24).toString('hex'),
        hashToken: sha256,
        isHash: v => typeof v === 'string' && v.startsWith('scrypt$')
    };
})();
