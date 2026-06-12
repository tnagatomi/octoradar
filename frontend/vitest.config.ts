import {defineConfig} from 'vitest/config';

// Pure-logic unit tests run in a plain Node environment — no DOM needed.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
