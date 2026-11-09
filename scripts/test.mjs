import { patchChildProcess } from './sandbox-shim.mjs';

patchChildProcess();

const { startVitest } = await import('vitest/node');

const vitest = await startVitest('test', process.argv.slice(2), {
  watch: false,
  run: true,
});

await vitest?.close();

process.exitCode = vitest?.state.getCountOfFailedTests() ? 1 : 0;
