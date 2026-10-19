// Runs inside the engine, after the site's own logic is loaded. These are the only functions anonymous visitors can
// reach (teaching applications and password resets). They check the size and shape of everything first, hand the
// school's own logic a clean copy with only the expected fields, and never return passwords, hashes or admin notes.
(function () {
    const TOS = window.TOS, ST = TOS.staff;
    const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
    const str = (v, max, label, req) => {
        if (v == null || v === '') { if (req) fail('INVALID', label + ' is required.'); return ''; }
        if (typeof v !== 'string' || v.length > max) fail('INVALID', label + ' is too long or invalid.');
        return v;
    };
    const list = (v, max, itemMax, label) => {
        if (v == null) return [];
        if (!Array.isArray(v) || v.length > max) fail('INVALID', label + ' is invalid.');
        return v.map(x => str(x, itemMax, label));
    };
    // Documents and photos arrive as data URLs (small files) or links. Only these safe kinds are accepted.
    const SAFE_URL = /^(data:(image\/(png|jpe?g|webp|gif)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))[;,]|https?:\/\/)/i;
    const docs = (v, max) => {
        if (v == null) return [];
        if (!Array.isArray(v) || v.length > max) fail('INVALID', 'Too many documents attached.');
        return v.map(d => {
            if (!d || typeof d !== 'object') fail('INVALID', 'A document is invalid.');
            const url = str(d.url, 1500000, 'Document', true);
            if (!SAFE_URL.test(url)) fail('INVALID', 'Only PDF, Word, image files or web links can be attached.');
            return { kind: str(d.kind, 30, 'Document kind') || 'other', name: str(d.name, 200, 'Document name'), size: +d.size || 0, type: str(d.type, 100, 'Document type'), url };
        });
    };
    const need = (cond, e) => { if (!cond) throw e; };

    TOS.serverPublic = {
        applyBlock: email => ST.applyBlock(str(email, 254, 'Email', true)),

        apply(d) {
            d = d && typeof d === 'object' ? d : {};
            const password = str(d.password, 128, 'Password', true);
            if (password.length < 8) fail('INVALID', 'Use at least 8 characters for your password.');
            const photo = str(d.photo, 1500000, 'Photo');
            if (photo && !/^data:image\/(png|jpe?g|webp|gif)[;,]/i.test(photo) && !/^https?:\/\//i.test(photo)) fail('INVALID', 'The photo must be an image.');
            const clean = {
                firstName: str(d.firstName, 100, 'First name', true), lastName: str(d.lastName, 100, 'Last name', true), email: str(d.email, 254, 'Email', true),
                phone: str(d.phone, 40, 'Phone', true), location: str(d.location, 200, 'Location', true), dateOfBirth: str(d.dateOfBirth, 20, 'Date of birth'), photo,
                expertise: str(d.expertise, 300, 'Area of expertise', true), subjects: list(d.subjects, 20, 100, 'Subjects'), qualifications: str(d.qualifications, 2000, 'Qualifications', true),
                education: str(d.education, 2000, 'Education'), yearsExperience: Math.max(0, Math.min(60, +d.yearsExperience || 0)), previousTeaching: str(d.previousTeaching, 3000, 'Previous teaching'),
                bio: str(d.bio, 4000, 'Bio', true), courseIds: list(d.courseIds, 30, 80, 'Courses'), teachingLevel: str(d.teachingLevel, 100, 'Level'), teachingExperience: str(d.teachingExperience, 3000, 'Teaching experience'),
                teachingMethod: str(d.teachingMethod, 200, 'Teaching method'), availability: str(d.availability, 500, 'Availability', true), documents: docs(d.documents, 8), password,
                confirmPassword: str(d.confirmPassword == null ? d.password : d.confirmPassword, 128, 'Password confirmation')
            };
            const r = ST.submitApplication(clean);
            return { id: r.id };
        },
        verifyEmail: token => { ST.verifyEmail(str(token, 200, 'Link', true)); return { ok: true }; },
        status(email, password) {
            const a = ST.applicationByCredentials(str(email, 254, 'Email', true), str(password, 128, 'Password', true));
            if (!a) fail('AUTH', 'Incorrect email or password.');
            return ST.applicantView(a);
        },
        withdraw: (email, password) => ST.withdraw(str(email, 254, 'Email', true), str(password, 128, 'Password', true)),
        reply: (email, password, body, documents) => ST.applicantReply(str(email, 254, 'Email', true), str(password, 128, 'Password', true), str(body, 4000, 'Reply'), docs(documents, 6)),
        // A student asks for a password reset: the school gets a request in the support inbox. Always answers the same.
        studentForgot(who, note) {
            who = str(who, 254, 'Email or student ID', true).trim().toLowerCase(); note = str(note, 1000, 'Note');
            const u = TOS.db.first('users', x => x.role === 'student' && (x.email === who || (x.studentId || '').toLowerCase() === who));
            if (u) TOS.engage.openTicket(u.id, { category: 'account', subject: 'Password reset request', body: 'Password reset requested from the sign-in page.' + (note ? '\n\nNote: ' + note : '') });
            return { ok: true };
        },
        // Always answers the same, whether or not the email belongs to a staff account
        forgot: email => { ST.requestPasswordReset(str(email, 254, 'Email', true)); return { ok: true }; },
        reset(token, password) {
            password = str(password, 128, 'Password', true);
            if (password.length < 8) fail('INVALID', 'Use at least 8 characters.');
            const r = ST.resetPasswordWithToken(str(token, 200, 'Link', true), password);
            return { ok: true, userId: (TOS.db.first('users', { email: r.email }) || {}).id || null };
        }
    };
    void need;
})();
