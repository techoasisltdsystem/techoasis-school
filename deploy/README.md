# Hosting Tech Oasis School on a VPS

The site is plain files (HTML, CSS, JS, images) with no build step, so the VPS only needs **nginx**.
These files reproduce exactly what Vercel does: the `/student`, `/staff` and `/admin` addresses, the security
headers, caching, and blocking of private files (`.git`, `db/`, `docs/`, `deploy/`, `*.md`).

| File | What it does |
|---|---|
| `nginx/techoasisschool.conf` | The nginx site for techoasisschool.com and www.techoasisschool.com |
| `nginx/security-headers.conf` | Security headers, shared by every part of the config |
| `setup-server.sh` | One-time setup: installs nginx, git and certbot, downloads the site, enables it, adds HTTPS |
| `deploy.sh` | Publishes the latest version from GitHub (`main`) |

Assumes Ubuntu or Debian. It only adds its own site and folder (`/var/www/techoasis-school`); other websites already
on the server keep running untouched.

## 1. Point the domain at the VPS

At your domain registrar, add two **A records** pointing to the VPS IP address:

| Type | Name | Value |
|---|---|---|
| A | `@` (techoasisschool.com) | your VPS IP |
| A | `www` | your VPS IP |

## 2. Set up the server (once)

```bash
ssh -i ~/.ssh/oasis_vps root@YOUR_VPS_IP
curl -fsSL https://raw.githubusercontent.com/techoasisltdsystem/techoasis-school/main/deploy/setup-server.sh | sudo bash
```

If the domain already points at the server, HTTPS is set up automatically. If not, the script says so; once DNS has
updated, run:

```bash
sudo certbot --nginx --redirect -d techoasisschool.com -d www.techoasisschool.com
```

## 3. Publish updates

After changes are pushed to GitHub (`main`):

```bash
ssh -i ~/.ssh/oasis_vps root@YOUR_VPS_IP 'bash /var/www/techoasis-school/deploy/deploy.sh'
```

## Notes

- **Private GitHub repo:** if the repository is made private, give the server read access with a
  [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) and set
  `REPO=git@github.com:techoasisltdsystem/techoasis-school.git` when running `setup-server.sh`.
- **Certificates** renew automatically (certbot installs a timer).
- **Social preview image and email links** use the address set in Admin → Settings → School → Website address
  (`https://techoasisschool.com`). Update the `og:image` tags in `index.html`, `course.html` and `verify.html` from the
  vercel.app address to `https://techoasisschool.com/brand/tech-oasis-social.png` once the domain is live on the VPS.
