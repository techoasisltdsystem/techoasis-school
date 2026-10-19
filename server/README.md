# Tech Oasis School server

The school's backend: PostgreSQL storage, sign-in sessions, and the school's rules enforced on the server so a browser
cannot skip them.

## How it works

- **The rules run here.** The server loads the same logic the website already uses (`assets/js/core/*`: enrollment, grading,
  certificates, staff approval, the student and staff APIs) and runs it for the signed-in user. Every check inside those
  functions (who you are, what you own, what permission you have) now happens on the server.
- **PostgreSQL is the store.** Each kind of record has its own table (`users`, `courses`, `enrollments` ...) with columns
  `id`, `data` (jsonb), `seq`, `updated_at`. The school's data is held in memory while the server runs and every change is
  written to PostgreSQL before the request is answered. On start it reloads everything from PostgreSQL.
- **Three ways in**
  - *Public*: the published catalog, certificate lookup, sign-in/registration, and teaching applications.
  - *Student / staff portals*: `POST /api/rpc/student/<function>` and `/api/rpc/staff/<function>` run the site's own API as the
    signed-in user.
  - *Administrator*: the admin screens edit their own copy of the data and send the changes to `POST /api/sync`, which
    validates them (known tables only, no password hashes from browsers, no new administrators, no internal settings).
- **Sessions**: a random token in an HttpOnly, SameSite cookie. Only its SHA-256 is stored. Passwords use scrypt.

## Run it

```bash
cd server && npm install
SEED_DEMO=1 npm start            # development: in-process PostgreSQL, sample school (data is lost on exit)
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/techoasis_school npm start     # production (set by deploy/setup-app.sh)
```

| Setting | Meaning | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection (production) | in-process PostgreSQL |
| `PORT`, `HOST` | where it listens (only nginx talks to it) | 3001, 127.0.0.1 |
| `SITE_URL` | public address; HTTPS makes cookies `Secure` | http://localhost:5502 |
| `SESSION_DAYS` / `SESSION_HOURS` / `ADMIN_SESSION_HOURS` | sign-in lifetimes | 30 / 12 / 8 |
| `MAX_BODY_MB` | largest request | 12 |

## Administration (on the VPS)

```bash
sudo techoasis-school-cli create-admin     # create the administrator, or reset their password
sudo techoasis-school-cli seed-catalog     # load the sample programmes (no people) to edit instead of starting blank
sudo techoasis-school-cli backup file.json # readable JSON copy of all data
sudo techoasis-school-cli stats            # row counts
```

## Tests

```bash
npm test                                   # in-process PostgreSQL
TEST_DATABASE_URL=postgres://... npm test  # a real PostgreSQL (an empty throwaway database)
```

The suite attacks the server the way a hostile visitor would: reading other students' data, forging grades and
certificates, escalating roles, creating administrators, smuggling password hashes, prototype pollution, cross-site
requests, brute-forcing sign-in, spamming applications, and using accounts after suspension. `deploy/setup-app.sh` runs it
on the VPS before the service starts.

## Known limits (planned)

- Uploaded files (application documents, assignment files, photos) are stored inside their records in PostgreSQL. Big ones are
  sent by link on request (`/api/blob/...`, access-checked) so pages stay light, but move them to disk or object storage before
  large numbers of users upload.
- Emails (verification, approval, password reset) are queued in `email_outbox` but not sent until a mail provider is connected.
- Online payments are off; an administrator records payments received outside the site.
- One server process. That keeps every change consistent; to scale beyond one process, the in-memory layer needs a lock or a
  fully query-based store.
