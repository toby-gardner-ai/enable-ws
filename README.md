# enable-ws

Personal website and AI Enablement hub, built with [Astro](https://astro.build) and hosted on Cloudflare.

## Run it locally

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs static site to dist/
```

## Where to edit

| What | File |
| --- | --- |
| Name, one-liner, email, LinkedIn, booking link | `src/config.ts` |
| Home page | `src/pages/index.astro` |
| Services | `src/pages/services.astro` |
| Free resources | `src/pages/resources.astro` (put PDFs in `public/resources/`) |
| About / bio | `src/pages/about.astro` |
| Blog posts | add a `.md` file to `src/content/blog/` |
| Case studies | add a `.md` file to `src/content/work/` |
| Colours, fonts | `src/styles/global.css` |

Anything in `[square brackets]` or marked `TODO` / "Placeholder" is waiting for real content.

### Writing a blog post

Create `src/content/blog/my-post.md`:

```md
---
title: 'My post title'
description: 'One sentence summary.'
pubDate: 2026-12-01
tags: ['strategy']
---

Your post in Markdown.
```

Set `draft: true` to hide a post until it's ready.

## Messaging approach

The copy follows a StoryBrand-style flow: the visitor is the hero, Toby is the guide. The home page goes from hero (one-liner and CTA) to problem, guide, a 3-step plan, stakes, proof, who it's for, and a final CTA. Each page pairs one direct CTA (book a call) with one low-commitment CTA (free resources). That gives visitors a clear default and a generous first step.

## Deploy on Cloudflare

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the `enable-ws` repository.
3. Framework preset: **Astro**. Build command `npm run build`, output directory `dist`.
4. Save and deploy. Every push to `main` then deploys automatically, and every pull request gets its own preview URL.

When you have a domain, add it under the project's **Custom domains** tab, and update `site` in `astro.config.mjs` and the sitemap line in `public/robots.txt`.
