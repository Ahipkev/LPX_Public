# LPX public site

The public LPX homepage, Archive, and For Artists page. This is a plain static HTML/CSS/JavaScript site: no framework, package installation, compilation, backend, or generated output directory.

## Site files

- `index.html`: homepage, served at `/`.
- `archive.html`, `archive.css`, `archive.js`: Archive and its client-side filters.
- `for-artists.html`, `for-artists.css`: artist invitation page.
- `styles.css`: shared design system.
- `images/`: original background, logo, favicon, and retained existing brand image.
- `AGENTS.md`: project design canon for future edits.

All page and asset paths are relative. Google Fonts is the existing external font dependency. The Archive links to external LPX experiences and stores filter state in query parameters; no server-side routing or database is needed.

## Local preview

From the repository root, run:

```powershell
python -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173/`, `/archive.html`, and `/for-artists.html`. Python is only a local preview tool, not a production dependency. If port 5173 is already serving this folder, reuse that server.

Optional JavaScript syntax verification with locally installed Node.js:

```powershell
node --check archive.js
```

Check desktop and mobile layouts, navigation, the favicon/background, and Archive filters. Selecting a Browse By view resets All Experiences; selecting an experience afterward combines them. Verify direct filtered URLs, clear/reset, and browser Back/Forward.

## Cloudflare Pages settings (for a later deployment)

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Production branch | main |
| Root directory | Leave blank (repository root) |
| Build command | none — leave the field blank; do not type the word `none` |
| Build output directory | `.` (repository root) |
| Environment variables | None required |

There is no build step and no build output to generate: the checked-in files are the deployable site. Cloudflare's static HTML guide also documents the optional no-op command `exit 0`; it is not a build system and is unnecessary for this site, which has no Pages Functions.

References: [Cloudflare static HTML guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/) and [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

The output directory is the whole repository root. Keep secrets and machine-local files out of it. `.gitignore` protects the Git upload, not arbitrary direct uploads of the working folder. Repository documentation is non-secret and may be served as static content.

No remote, GitHub repository, Cloudflare project, domain, or deployment is configured by this preparation step.

## First commit and push (not performed yet)

Review the files, then:

```powershell
git status --short --branch
git add .
git diff --cached --stat
git commit -m "Initial LPX public site"
```

Create an empty GitHub repository when ready, then use its actual URL:

```powershell
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

Replace the placeholder; do not run it literally. Git author identity and GitHub authentication must be configured on the machine used to commit/push.

## Known intentional placeholder

The For Artists interest buttons point to `#contact`, which says contact details are coming shortly. No email, form endpoint, or submission workflow has been fabricated. Choose a real contact method in a separate content task.
