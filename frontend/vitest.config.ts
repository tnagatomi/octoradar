import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two test projects, split by what they need from the environment:
//
//   unit       — pure-logic tests (*.test.ts) in a plain Node environment.
//   components — React component/hook tests (*.test.tsx) in jsdom, with the
//                React plugin for JSX and jest-dom matchers via the setup file.
//
// CI runs them as separate jobs (`pnpm test:unit` / `pnpm test:component`);
// `pnpm test` runs both.
export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'unit',
                    environment: 'node',
                    include: ['src/**/*.test.ts'],
                },
            },
            {
                plugins: [react()],
                test: {
                    name: 'components',
                    environment: 'jsdom',
                    // Give jsdom a concrete origin so localStorage works (the
                    // default about:blank origin is opaque and has no storage).
                    environmentOptions: {jsdom: {url: 'http://localhost'}},
                    include: ['src/**/*.test.tsx'],
                    setupFiles: ['./src/test/setup.ts'],
                },
            },
        ],
    },
});
