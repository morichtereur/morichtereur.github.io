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
npm run build    # static output to dist/
npm run preview  # serve the build
```

## Where the content lives

The site has no CMS and no content collections — copy sits in the components
that render it.

| What | Where |
|---|---|
| Name, email, social links | `src/consts.ts` |
| Page title, meta description | `src/layouts/BaseLayout.astro` |
| Headline and positioning | `src/components/Hero.astro` |
| Case studies | `caseStudies` array in `src/pages/index.astro` |
| Design tokens — colour, type, spacing | `src/styles/tokens.css` |

To add a case study, append an object to `caseStudies`. `CaseStudyCard` expects
`title`, `problem`, `build`, `stack` (array of strings), `metricValue` and
`metricLabel`.
