# Tech Oasis School

Online learning platform: public website, student learning experience and an admin LMS/CMS.
Static site (no build step): Tailwind via CDN, vanilla JavaScript, deployable as-is to Vercel or any static host.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Public homepage, catalog, about; staff **Instructor Hub** (classes, students, messages) |
| `/student/*` (`student/index.html`) | **Student Portal**, a separate signed-in app: dashboard, my courses, browse, course curriculum, lesson player, assignments, quizzes, certificates, progress, messages, announcements, notifications, calendar, schedule, resources, profile, settings, help |
| `course.html?c=<slug>` | Course landing page (curriculum, instructor, reviews, enrollment). `&preview=1` = admin preview incl. drafts |
| `learn.html?...&preview=1` | Admin lesson preview (students are redirected to `/student/learn/:lessonId`) |
| `verify.html?code=<id>` | Certificate view, print/PDF, public verification |
| `admin.html` | Admin CMS (sign in: `school@techoasisltd.com` / `admin123`; change it in **Settings → School**) |

## Code map

```
assets/js/core/db.js      Relational store: tables, foreign keys, cascades, ordering, persistence adapter
assets/js/core/lms.js     Domain logic: curriculum tree, authoring, progress, quizzes, assignments,
                          certificates, checkout, analytics
assets/js/core/video.js   Video provider registry (YouTube, Vimeo, MP4/WebM, Bunny, Cloudflare, Loom, embed)
assets/js/core/auth.js    Accounts and sessions (+ one-time import of data from the old single-page version)
assets/js/core/engage.js  Notifications (row triggers), messaging + permissions, calendar, support tickets, notes, student IDs
assets/js/core/api.js     Student API: the only data interface the portal uses (session + ownership checks)
assets/js/student/*.js    Student portal: app shell/router, sign-in, dashboard, courses, learning, work, comms, academic, account
assets/js/core/seed.js    Sample content (12 programs; "Web Development" has the full 6-section curriculum)
assets/js/admin/*.js      CMS screens (courses + builder, lesson editor, learning, people, commerce, analytics, settings)
assets/js/pages/*.js      Public pages
db/schema.sql             PostgreSQL/Supabase schema matching db.js one-to-one
```

Content hierarchy: **Course → Sections → Lessons → Content items**, with Quiz / Assignment / Resources attached to lessons
(resources can also attach to a whole course). Enrollment, LessonProgress, QuizAttempt, Submission and Certificate link students to that tree by ID.

Add a video host: `TOS.video.register({ id, label, match(url), parse(url), thumbnail(ref), mount(el, item, hooks) })`.

## Run locally

The student portal uses real paths (`/student/dashboard`), so the server must rewrite `/student/*` to `student/index.html`.
`vercel.json` (Vercel) and `serve.json` (`npx serve`) already do this:

```bash
npx serve -l 5501
```

Student sign-in: `/student/login` (sample student: `margaret@gmail.com` / `student123`). Admin: `/admin`.

VS Code Live Server has no rewrites: open `/student/` and navigate from there (refreshing a deep link will 404).

## Before launch (important)

This build stores all data **in each visitor's browser** (`localStorage`). It is a complete, working product demo, but a real
school needs shared, server-side data. To launch:

1. **Database + auth:** create the tables in `db/schema.sql` (e.g. on Supabase), enable Row Level Security, and replace
   `LocalStorageAdapter` in `db.js` / the functions in `auth.js` with API calls. Admin access must be enforced server-side.
2. **Payments:** connect Paystack, Flutterwave or Stripe. Orders must be marked paid by the provider's webhook, never by the browser.
3. **File storage:** host videos on a video provider and files in object storage (uploads are limited to 1 MB in the demo).
4. **Content:** in **Admin → Settings → School → Data**, export a backup, then **Start fresh** to remove the sample
   courses, students, orders and reviews before adding your own.
