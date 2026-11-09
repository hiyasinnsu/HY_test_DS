import cp from 'node:child_process';

/**
 * Some execution environments block child processes (`spawn EPERM`). Vite's
 * Windows realpath helper shells out to `net use` while loading a config, which
 * aborts every CLI entry point before it starts.
 *
 * Replacing `exec`/`execFile` with a failing no-op makes that helper fall back
 * to plain `fs.realpathSync`, so tools run fully in-process. Outside such
 * sandboxes this shim is unnecessary; `npm run dev` and `npx vite build` keep
 * working normally because the shim only patches the process that imports it.
 */
export function patchChildProcess() {
  const blocked = (_command, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    if (typeof cb === 'function') {
      queueMicrotask(() => cb(new Error('child process blocked by sandbox')));
    }
    return {
      on() {},
      once() {},
      off() {},
      kill() {},
      unref() {},
      stdout: null,
      stderr: null,
      stdin: null,
    };
  };

  cp.exec = blocked;
  cp.execFile = blocked;
}
