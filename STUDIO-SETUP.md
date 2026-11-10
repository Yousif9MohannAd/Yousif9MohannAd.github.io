# Private Studio setup

The Studio API is implemented for Vercel Node functions. It is not a browser password screen or a local-only save. Until its server environment is configured, `/api/studio/session` returns HTTP 503 with `configured: false` and the missing variable names. No sign-in or online save is simulated.

The static portfolio can still run on GitHub Pages, but GitHub Pages cannot execute these API functions. Use the Vercel site as the canonical Studio origin.

## GitHub App

The owner must create and install a GitHub App in the GitHub settings UI. Creating the App, installing it, and adding secrets are final account setup actions; the implementation does not perform them automatically.

Configure:

- Homepage URL: the canonical HTTPS site origin.
- User authorization callback URL: `<STUDIO_ORIGIN>/api/studio/callback`.
- Repository permissions: **Contents: read and write**, **Metadata: read**. No account or organization permissions are needed.
- Webhooks: disabled; this Studio does not receive webhooks.
- Installation: this owner's account, with access to **only** `Yousif9MohannAd/Yousif9MohannAd.github.io`.
- Keep expiring user access tokens enabled. The Studio does not request offline access or persist user/refresh tokens.

GitHub's Contents write permission is repository-wide. The server implementation further fixes the repository, branch source and `content.json` path, and does not accept alternate targets from the browser. Every generated installation token is restricted to repository ID `1354383590` with Contents write and Metadata read permissions.

Only GitHub numeric account ID **185284854** can obtain a Studio session. A matching display name or username is not sufficient.

`studio-app-manifest.json` is a registration-settings template for review. It marks the App private, grants only Contents write and Metadata read, disables webhook delivery, and includes both stable preview and production callback URLs. Its homepage is the production Vercel URL, while its installation setup link opens the review preview Studio. GitHub requires a URL inside `hook_attributes`; the inactive hook uses the public homepage, and there are no subscribed events or webhook handler.

The GitHub manifest format does not contain a selected-repository installation field. During installation, the owner must still select **Only select repositories** and choose this repository. No registration/conversion endpoint is implemented by Studio, and this template has not created an App or granted access. It can be used as the reference for manual registration; an automated manifest registration would need its own secure conversion step for the generated secrets.

## Vercel environment

Add the following as private environment variables to the relevant **Preview** environment, then redeploy that preview. Do not commit secrets or paste them into chat, browser storage, generated source, or local configuration files.

| Variable | Value |
| --- | --- |
| `GITHUB_APP_ID` | The App's numeric App ID. |
| `GITHUB_CLIENT_ID` | The App's client ID. |
| `GITHUB_CLIENT_SECRET` | The App's client secret. |
| `GITHUB_PRIVATE_KEY` | The App's RSA private key PEM, entered directly into the secret field. Literal `\n` line breaks are supported. |
| `STUDIO_SESSION_SECRET` | At least 32 random bytes generated in a password manager or another secure local tool; a 64-character random hex value is suitable. |
| `STUDIO_ORIGIN` | The canonical HTTPS origin, without a path/query/fragment. Use the stable branch preview alias so it matches the registered callback URL. |
| `CONTENT_BRANCH` | Optional fixed branch. Set `codex/portfolio-redesign-20261109` for the current review preview. Otherwise the server uses `VERCEL_GIT_COMMIT_REF`, then that same review branch as its fallback. |

Current preview origin:

`https://yousif9-mohann-ad-github-io-git-codex-portfolio-d6003b-jo-45f5.vercel.app`

Do not point the publisher at `main` or enable a production publishing path before the site review is approved. Saving in this preview creates a commit on the review branch; it does not merge a PR or publish production on its own.

For a later approved production setup, use Production-scoped values with `STUDIO_ORIGIN=https://yousif9-mohann-ad-github-io.vercel.app` and an explicit production `CONTENT_BRANCH`. Do not copy the production branch target into Preview. The two callback URLs are allowed by the App, but the server uses only its own environment's exact `STUDIO_ORIGIN`; the browser cannot select another callback or publishing branch.

The server rejects malformed origin, branch, key, and session-secret configuration. Keep one consistent session secret for a deployed environment. Rotating it invalidates existing sign-in sessions.

## First use

1. Open `<STUDIO_ORIGIN>/studio.html`.
2. Sign in with GitHub. The authorization flow uses a signed 10-minute state cookie and PKCE with SHA-256.
3. Confirm that GitHub is authorizing the intended App for the intended repository.
4. The callback verifies the immutable owner ID, discards the OAuth token after identity verification, and creates a 30-minute HttpOnly, Secure, SameSite session cookie.
5. Load the current document, edit it, and save. A save supplies the current file SHA and a CSRF token, and commits only `content.json`.
6. A 409 means the remote file changed after it was loaded. Preserve the current draft, reload the remote content, and reconcile changes before retrying; there is no forced overwrite.

The existing GitHub/Vercel integration builds the branch preview after a commit. The public site update follows that deployment; a successful file save is not a claim that a deployment has already finished.

## API contract

| Endpoint | Result |
| --- | --- |
| `GET /api/studio/session` | `{authenticated, configured, user?, csrfToken?, missing?, invalid?}`. Missing configuration is HTTP 503. |
| `GET /api/studio/login` | Redirects to GitHub App OAuth. |
| `GET /api/studio/callback` | Verifies state/code/owner and redirects to `/studio.html`. |
| `POST /api/studio/logout` | Requires the current session, same origin and `X-CSRF-Token`; clears the cookies. |
| `GET /api/studio/content` | Requires the owner session; returns `{document, sha, branch}`. |
| `PUT /api/studio/content` | Requires session, same origin, JSON, CSRF and `{document, sha}`; returns `{saved, sha, branch, commitSha, url}`. |

Content requests do not accept query parameters or client-selected repository, branch or path. The body limit is 250 KB. The schema requires version 1, bounded text/arrays, unique safe section and item IDs, and valid section references. Unknown JSON fields survive round trips, with depth/size/prototype-key limits.

Home is pinned as the first visible section. Custom sections remain supported, but their IDs cannot collide with page-owned IDs or another section's heading ID. Optional About/GitHub/lab fields may be omitted; the public renderer must supply harmless display defaults rather than invent personal information.

No access or installation token is written to disk, cookies, logs, or localStorage. Private API responses are marked `no-store`, including Vercel's CDN cache headers. Logout clears the browser's session; the signed session also expires after 30 minutes.

## Verification

Run from the task workspace:

```text
npm test
```

The tests generate temporary RSA keys in memory and mock all GitHub calls. They exercise owner identity, state/PKCE, signature/tamper/expiry checks, cookie flags, origin/CSRF boundaries, body size, custom section references, unknown-field preservation, fixed repository/file writes, and stale-SHA conflicts. They do not register an App, install permissions, use real credentials, or write to GitHub.

Live sign-in and publishing still require the App installation, environment variables, and a preview redeployment. After configuration, verify that a non-owner account is denied and that the first owner save updates only `content.json` on the review branch.

Primary implementation references: [GitHub App user tokens and PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), [PKCE support announcement](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/).
