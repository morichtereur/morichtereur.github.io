# morichtereur.github.io

Source for my personal site — [morichtereur.github.io](https://morichtereur.github.io/).

A single static page: what I work on, a set of case studies, and a way to reach me.
Built with Astro, deployed to GitHub Pages by the workflow in
`.github/workflows/deploy.yml` on every push to `main`.

## Running it locally

Requires Node 22.12 or newer (see `.nvmrc`).

```sh
npm install
npm run dev      # localhost:4321
npm run check    # astro check — types and component diagnostics
npm run build    # static output to dist/
npm run preview  # serve the build
```

## Where the content lives

The site has no CMS and no content collections — copy sits in the components
that render it.

| What | Where |
|---|---|
| Name, email, social links | `src/consts.ts` |
| Page title, meta description, social card | `src/layouts/BaseLayout.astro` |
| Headline and positioning | `src/components/Hero.astro` |
| Case studies | `caseStudies` array in `src/pages/index.astro` |
| Case study groups and their order | `groups` array in `src/pages/index.astro` |
| Design tokens — colour, type, spacing | `src/styles/tokens.css` |

### Adding a case study

Append an object to `caseStudies`. `CaseStudyCard` reads:

| Field | Required | What it is |
|---|---|---|
| `title` | yes | Card heading |
| `summary` | yes | One plain sentence saying what the thing is |
| `data` | yes | Where the data came from, in a few words |
| `group` | yes | `gbs`, `operations` or `intelligence` — must match a `key` in `groups` |
| `problem` | yes | Why it exists |
| `build` | yes | What was built |
| `stack` | yes | Array of strings, rendered as tags |
| `metricValue` / `metricLabel` | yes | The outcome figure and its caption |
| `implication` | yes | The "so what" |
| `repoUrl` | no | Source repository |
| `demoUrl` | no | A deployed, working version |
| `figure` | no | `{ src, alt, caption, blend? }` — `src` is an imported image; `blend` multiplies a white-background chart onto the paper |
| `signal` | no | `{ total, signal }` — renders the mark field |

A card whose `group` matches no key in `groups` is silently dropped, since the
page renders group by group.

## Interactive dashboards

Several case studies link to a live dashboard served from this site under
`public/`. Each is a single self-contained HTML file that is built and published
in its own project repository and vendored in here, so serving it costs one copy
and no build step. The one exception is the Finance Data Foundation dashboard,
whose project currently lives in this repository under
`finance-data-foundation/` — see that directory's README for the pipeline that
builds it; `sync:dashboards` copies it into `public/` alongside the fetched
ones.

A vendored copy drifts, and a stale dashboard is worse than none — it shows a
reader numbers the study has already corrected. Re-sync before a release, or
whenever a source repository publishes new results:

```sh
npm run sync:dashboards
```

The script reports `updated`, `unchanged` or `FAILED to fetch` per dashboard and
exits non-zero if any fetch failed.
