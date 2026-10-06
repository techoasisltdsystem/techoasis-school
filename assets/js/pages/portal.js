// Sign-in chooser on the public website. Each audience has its own portal and login:
// students -> /student/login, approved staff -> /staff/login (applicants -> /staff/apply).
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openCourseraAuthModal(role) {
    if (role === 'staff') { location.href = '/staff/login'; return false; }
    if (role === 'student') { location.href = '/student/login'; return false; }
    document.getElementById('courseraAuthModal').classList.remove('hidden');
    return false;
}
function chooseRole(role) { location.href = role === 'staff' ? '/staff/login' : '/student/login'; }
function logoutUser(e) {
    if (e) e.stopPropagation();
    TOS.auth.logout();
    go('home');
}
