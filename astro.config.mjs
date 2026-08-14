// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://morichtereur.github.io',
  output: 'static',
  fonts: [
    {
      name: 'Archivo',
      cssVariable: '--font-archivo',
      provider: fontProviders.fontsource(),
      weights: [400, 600, 700],
      styles: ['normal'],
      subsets: ['latin'],
    },
    {
      name: 'Source Serif 4',
      cssVariable: '--font-source-serif',
      provider: fontProviders.fontsource(),
      weights: [400, 600],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
    },
    {
      name: 'IBM Plex Mono',
      cssVariable: '--font-plex-mono',
      provider: fontProviders.fontsource(),
      weights: [400, 500],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['monospace'],
    },
  ],
});
