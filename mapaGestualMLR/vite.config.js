import { defineConfig } from 'vite';
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webPublicFolders = ['analysis', 'brand', 'content', 'fonts', 'traffic'];

export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    base: '/',
    worker: { format: 'iife' },
    build: {
      target: web ? 'baseline-widely-available' : 'chrome140',
      copyPublicDir: !web,
      rolldownOptions: { input: { map: 'index.html', companion: 'companion.html' } }
    },
    plugins: web ? [{
      name: 'mlr-web-public-assets',
      async writeBundle({ dir }) {
        const assets = webPublicFolders.map(folder =>
          cp(fileURLToPath(new URL(`./public/${folder}`, import.meta.url)), resolve(dir, folder), { recursive: true }));
        const notices = cp(fileURLToPath(new URL('./THIRD_PARTY_NOTICES.md', import.meta.url)), resolve(dir, 'THIRD_PARTY_NOTICES.md'));
        await Promise.all([...assets, notices]);
      }
    }] : []
  };
});
