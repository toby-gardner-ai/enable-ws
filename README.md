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
| AI Enablement dropdown | `NAV` in `src/config.ts` |
| Readiness Checklist | `src/pages/readiness.astro` (content: see below) |
| Control graph (home page story, bands on Risk Map and Control Lifecycle) | `src/components/ControlGraph.astro` (reusable; `focus` picks the layer), `src/lib/graph-view.ts`, story steps in `src/components/Governance.astro` |
| AI Controls dropdown | `NAV` in `src/config.ts`; pages in `src/pages/controls/` (lifecycle map, library, one page per control) and `src/pages/risks/` (risk map, one page per risk) |
| Glossary and Subjects pages | `src/pages/glossary.astro`, `src/pages/subjects.astro`, in-depth subject pages in `src/pages/subjects/[slug].astro` (content: see below) |
| About / bio | `src/pages/about.astro` |
| Blog posts | add a `.md` file to `src/content/blog/` |
| Case studies | add a `.md` file to `src/content/work/` |
| Colours, fonts | `src/styles/global.css` |

Anything in `[square brackets]` or marked `TODO` / "Placeholder" is waiting for real content.

### Updating the Glossary, Subjects, Readiness Checklist and Controls

Their content comes from the `ai-governance` repo, which this script expects next to `personal-ws`:

| Page | Source | Generated file |
| --- | --- | --- |
| Glossary, Subjects | `admin/governance_subject.md` | `src/data/glossary.json`, `src/data/subjects.json` |
| Readiness Checklist | `research/ai_readiness_qs.json` | `src/data/readiness.json` |
| AI Controls | `admin/control_register.md`, `standard/agent_standard.md` (gates), `admin/policy.md` (definitions) | `src/data/controls.json` |
| Risk Map | `assets/risk_register.md`, `assets/risk_method.md` (scales, catalogues), plus each risk's explanation from the newer `graph.json` | `src/data/risks.json` |
| Control graph | `graph/out/graph.json` or `graph/build/graph.json`, whichever is newer (run `graph/extract.py` there first) | `src/data/graph.json` |

```sh
npm run extract                                  # regenerate everything
npm run extract:governance -- path/to/governance_subject.md
npm run extract:readiness -- path/to/ai_readiness_qs.json
npm run extract:controls -- path/to/ai-governance
npm run extract:graph -- path/to/graph.json
npm run extract:risks -- path/to/ai-governance
```

Run these from the `enable-ws` folder. Controls link to Governance Subjects through the requirement numbers both registers cite, so regenerate both together (`npm run extract`).

Readiness answers are saved in each visitor's browser under the key `readiness:v1`. If the questions change a lot, bump that key in `src/pages/readiness.astro` so old answers don't attach to the wrong questions.

Don't edit the JSON by hand; it is overwritten on each run. A subject that has Considerations and Why it matters sections gets its own page at `/subjects/<name>` automatically.

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
