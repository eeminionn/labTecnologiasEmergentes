import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  worker: { format: 'iife' },
  build: {
    target: 'chrome140',
    rolldownOptions: { input: { map: 'index.html', companion: 'companion.html' } }
  }
});
