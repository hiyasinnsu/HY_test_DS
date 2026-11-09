import { patchChildProcess } from './sandbox-shim.mjs';

patchChildProcess();

const { build } = await import('vite');
await build();
