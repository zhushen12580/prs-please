import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.PRS_PLEASE_BASE ?? '/prs-please/',
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
