import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,e2e}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/worktree_*/**'],
  },
});
