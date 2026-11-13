import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['bridge/extension/test/**/*.test.ts'],
  },
});
