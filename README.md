# Yousif.J0

A dark portfolio for Yousif Mohannad with a procedural Three.js scene, GSAP text and scroll motion, a source-linked security observatory, and a personal content Studio.

## Run and verify

Use Node.js 22 or later. The build and tests have no npm dependencies.

```sh
npm test
npm run build
```

Deploy the repository to Vercel to execute the functions under `api/`. The build creates `dist/` and regenerates the root `index.html` from `content.json`. A plain static server can show the portfolio and local Studio drafts; private sign-in and fresh reports need the API runtime. GitHub Pages cannot execute these functions.

The repository vendors Three.js 0.187.0 and GSAP 3.15.1 locally. Their upstream notices are included. No model, texture or animation-library download is needed at runtime. Google Fonts has a system-font fallback.

## Content and Studio

`content.json` is the single source of truth. It stores the profile, capabilities, study topics, training, experience and section order. The initial personal information is preserved; the eight new areas are explicitly marked **Studying**.

Open `/studio.html` to edit the profile, add capabilities or study topics, assign them to a section, create sections, change headings, and reorder or hide sections. Home stays first and visible. Local drafts, import/export, undo removal and conflict handling protect work in progress. Local drafts are a convenience; they are not private storage on a shared device.

Private online saving requires the GitHub App configuration in [STUDIO-SETUP.md](STUDIO-SETUP.md). An unconfigured deployment disables online sign-in and saving. It never simulates a successful login or publication.

Only the configured owner's immutable GitHub account ID can obtain an online session. The server writes only `content.json` in this fixed repository, on its configured branch. It uses expiring owner sessions, HttpOnly cookies, state/PKCE, same-origin and CSRF checks, bounded validated JSON, and SHA-based conflict detection. Secrets stay in the server environment.

For this review, keep `CONTENT_BRANCH=codex/portfolio-redesign-20261109` and use Preview-scoped environment variables. Studio saves create review-branch commits. They do not merge the pull request. Configure production only after the owner approves the review.

## Motion and accessibility

Scroll reveals replay when entering sections from either direction. The name, focus controls and study topics interact with the scene. Offense uses an original attack-surface lattice with scanning arcs and moving route markers. Small section sculptures and orbits animate while visible.

Pause stops continuous 3D and decorative motion. Offscreen visuals and hidden tabs stop their loops. Reduced-motion preferences are respected by default. Text remains visible when JavaScript or GSAP is unavailable; WebGL has a CSS fallback. The country selector provides a keyboard alternative to the pointer map.

## Security observatory

The server reads fixed public sources: Google Security, Microsoft Security, Cloudflare, OpenAI security-related posts and CISA's Known Exploited Vulnerabilities catalog. It publishes bounded headlines, source links and dates, with cached, partial, empty and unavailable states. A dated snapshot is an explicitly labeled fallback.

Country selection requests public news coverage through GDELT. It is **not live attack telemetry**, attacker attribution, or a complete incident inventory. An unavailable country feed does not fall back to unrelated global stories. See `data/WORLD-MAP-NOTICE.txt` for map provenance and licensing.

## Search identity

The public page includes the site name **Yousif.J0**, a descriptive title, canonical URL, Open Graph metadata, WebSite/Person structured data, robots.txt and a sitemap. These help crawlers identify the site. Search-engine indexing and ranking are controlled by the search provider.

The Studio is marked `noindex, nofollow`. The editor itself is a public static interface; authenticated server routes enforce private online access.
