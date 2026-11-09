/**
 * Headless runtime smoke test for the built game.
 *
 * The sandbox has no browser, so this loads `dist/assets/index-*.js` with a
 * minimal DOM + Canvas2D shim and drives real animation frames while firing
 * synthetic pointer events (start tap, drag, bomb, pause/resume). It catches
 * runtime wiring errors in main/render/ui that unit tests cannot see, e.g. a
 * wrong method call on the canvas context or an event handler crashing.
 *
 * Run after `node scripts/build.mjs`:  node scripts/smoke.mjs
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DIST = new URL('../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', DIST), 'utf8');
const entryMatch = html.match(/<script[^>]+src="([^"]+)"/);
if (!entryMatch) throw new Error('could not find the bundle <script> in dist/index.html');
const entryPath = new URL(entryMatch[1].replace(/^\.\//, ''), DIST);

const noop = () => {};
let clock = 0;
const rng = (() => {
  let state = 0x2f6e2b1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
})();

const drawCalls = new Map();
function record(name) {
  drawCalls.set(name, (drawCalls.get(name) ?? 0) + 1);
}

function makeGradient() {
  return { addColorStop: noop };
}

function makeContext(canvas) {
  const gl = { addColorStop: noop };
  const base = {
    canvas,
    save: () => record('save'),
    restore: () => record('restore'),
    setTransform: () => record('setTransform'),
    transform: noop,
    resetTransform: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    fill: () => record('fill'),
    stroke: () => record('stroke'),
    clip: noop,
    fillRect: () => record('fillRect'),
    strokeRect: noop,
    clearRect: noop,
    fillText: (text) => record(`text:${String(text).slice(0, 12)}`),
    strokeText: noop,
    measureText: (text) => ({ width: String(text).length * 8 }),
    drawImage: () => record('drawImage'),
    createLinearGradient: () => makeGradient(),
    createRadialGradient: () => makeGradient(),
    createConicGradient: () => gl,
    createPattern: () => null,
    setLineDash: noop,
    getLineDash: () => [],
    getImageData: (_x, _y, w, h) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    }),
    putImageData: noop,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      // Unknown member: assume a method call; property reads get this no-op too,
      // which is harmless because the code only writes style properties.
      return noop;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

function makeElement(tag) {
  const style = {};
  return {
    tagName: String(tag).toUpperCase(),
    style,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child);
      return child;
    },
    remove: noop,
    setAttribute: noop,
    getAttribute: () => null,
    addEventListener: noop,
    removeEventListener: noop,
  };
}

function makeCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    tagName: 'CANVAS',
    setAttribute: noop,
    addEventListener(type, handler) {
      if (!canvas.__listeners.has(type)) canvas.__listeners.set(type, []);
      canvas.__listeners.get(type).push(handler);
    },
    removeEventListener: noop,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: globalThis.window.innerWidth,
      height: globalThis.window.innerHeight,
    }),
    __listeners: new Map(),
  };
  canvas.__ctx = makeContext(canvas);
  canvas.getContext = () => canvas.__ctx;
  canvas.dispatch = (type, event) => {
    for (const handler of canvas.__listeners.get(type) ?? []) handler(event);
  };
  return canvas;
}

const gameCanvas = makeCanvas();
const windowListeners = new Map();
const documentListeners = new Map();

function addTo(map, type, handler) {
  if (!map.has(type)) map.set(type, []);
  map.get(type).push(handler);
}

const storage = new Map();
const localStorageShim = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
  key: (index) => [...storage.keys()][index] ?? null,
  get length() {
    return storage.size;
  },
};

const fakeWindow = {
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
  addEventListener: (type, handler) => addTo(windowListeners, type, handler),
  removeEventListener: noop,
  requestAnimationFrame: (cb) => globalThis.requestAnimationFrame(cb),
  cancelAnimationFrame: (id) => globalThis.cancelAnimationFrame(id),
  getComputedStyle: (el) => ({
    paddingTop: '0px',
    paddingBottom: '0px',
    getPropertyValue: () => '0px',
  }),
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  localStorage: localStorageShim,
  visualViewport: { width: 390, height: 844, addEventListener: noop, removeEventListener: noop },
  performance: { now: () => clock },
};

const fakeDocument = {
  readyState: 'complete',
  hidden: false,
  body: makeElement('body'),
  documentElement: makeElement('html'),
  head: makeElement('head'),
  querySelector: (selector) => (selector === '#game' ? gameCanvas : null),
  querySelectorAll: () => [],
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : makeElement(tag)),
  addEventListener: (type, handler) => addTo(documentListeners, type, handler),
  removeEventListener: noop,
};

globalThis.window = fakeWindow;
globalThis.document = fakeDocument;
// Node 24 exposes `navigator`/`localStorage` as getter-only globals, so they
// have to be redefined rather than assigned.
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'headless-smoke', vibrate: noop, maxTouchPoints: 5 },
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', { value: localStorageShim, configurable: true });
globalThis.getComputedStyle = fakeWindow.getComputedStyle;
globalThis.devicePixelRatio = fakeWindow.devicePixelRatio;
// Vite's module-preload polyfill watches the document; a stub observer is
// enough because the shim never inserts real <link> elements.
globalThis.MutationObserver = class MutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};
globalThis.HTMLCanvasElement = class HTMLCanvasElement {};
globalThis.Image = class Image {};

const frameQueue = [];
let nextFrameId = 1;
globalThis.requestAnimationFrame = (cb) => {
  frameQueue.push(cb);
  return nextFrameId++;
};
globalThis.cancelAnimationFrame = noop;

const FRAME_MS = 1000 / 60;
function frame(steps = 1) {
  for (let i = 0; i < steps; i += 1) {
    clock += FRAME_MS;
    const batch = frameQueue.splice(0, frameQueue.length);
    for (const cb of batch) cb(clock);
  }
}

// Field (450x800) -> client (CSS px) mapping, mirroring core/viewport.ts.
const scale = Math.min(390 / 450, 844 / 800);
const offsetX = (390 - 450 * scale) / 2;
const offsetY = (844 - 800 * scale) / 2;
const toClient = (fieldX, fieldY) => ({
  clientX: offsetX + fieldX * scale,
  clientY: offsetY + fieldY * scale,
});

let pointerId = 1;
function pointer(type, fieldX, fieldY) {
  const { clientX, clientY } = toClient(fieldX, fieldY);
  const event = {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX,
    clientY,
    preventDefault: noop,
    stopPropagation: noop,
  };
  if (type === 'pointerdown') gameCanvas.dispatch('pointerdown', event);
  else if (type === 'pointermove') gameCanvas.dispatch('pointermove', event);
  else for (const handler of windowListeners.get(type) ?? []) handler(event);
  return event;
}

const errors = [];
process.on('uncaughtException', (error) => {
  errors.push(error);
  console.error('[smoke] uncaught', error);
});

try {
  await import(pathToFileURL(entryPath.pathname.replace(/^\/([A-Za-z]:)/, '$1')).href);
} catch (error) {
  console.error('[smoke] FAILED to load the bundle', error);
  process.exit(1);
}
if (errors.length > 0) {
  console.error('[smoke] FAILED: the bundle threw while loading');
  process.exit(1);
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const tap = (fieldX, fieldY) => {
  pointer('pointerdown', fieldX, fieldY);
  pointer('pointerup', fieldX, fieldY);
};

frame(5);
check(gameCanvas.width > 0, 'the canvas was never sized');

// main.ts exposes the Game instance on window for manual debugging; the smoke
// test uses it to assert real screen transitions.
const app = fakeWindow.__game;
check(Boolean(app), 'window.__game was not exposed');
const screenNow = () => app?.screen;
const isResultScreen = () => screenNow() === 'gameover' || screenNow() === 'clear';

check(screenNow() === 'title', `expected the title screen, got ${screenNow()}`);

tap(225, 400); // start
frame(10);
check(screenNow() === 'playing', `tap on the title did not start a run (${screenNow()})`);

const dragPointer = pointerId;
pointerId += 1;
pointer('pointerdown', 225, 700);
function drag(seconds) {
  const targetX = 225 + Math.sin(seconds * 0.55) * 150;
  const { clientX, clientY } = toClient(targetX, 700);
  gameCanvas.dispatch('pointermove', {
    pointerId: dragPointer,
    clientX,
    clientY,
    preventDefault: noop,
  });
}

// --- Phase 1: pause / resume, death, retry, hidden-tab auto pause -----------
frame(120);
drag(2);
tap(408, 32); // pause button
frame(3);
const pauseVerified = screenNow() === 'paused';
tap(225, 339); // resume
frame(3);
const resumeVerified = screenNow() === 'playing';

let reachedResult = false;
for (let seconds = 3; seconds < 90; seconds += 1) {
  drag(seconds);
  frame(60);
  if (seconds === 20) tap(388, 742); // bomb
  if (isResultScreen()) {
    reachedResult = true;
    break;
  }
}

let retryVerified = false;
if (reachedResult) {
  tap(225, 519); // retry
  frame(10);
  retryVerified = screenNow() === 'playing';
}

let hiddenPaused = false;
if (screenNow() === 'playing') {
  fakeDocument.hidden = true;
  for (const handler of documentListeners.get('visibilitychange') ?? []) handler({});
  frame(3);
  hiddenPaused = screenNow() === 'paused';
  fakeDocument.hidden = false;
  for (const handler of documentListeners.get('visibilitychange') ?? []) handler({});
  if (screenNow() === 'paused') {
    tap(225, 339); // resume after the auto pause
    frame(3);
  }
}

// --- Phase 2: invulnerable run so the boss and dense patterns get rendered --
let bossSeen = false;
let maxBullets = 0;
let maxEnemies = 0;
for (let seconds = 0; seconds < 190; seconds += 1) {
  drag(seconds);
  const world = app?.world;
  if (world) {
    // Test-only god mode: keeps the run alive long enough to reach the boss.
    world.player.invuln = 3;
    if (world.boss) bossSeen = true;
    maxBullets = Math.max(maxBullets, world.bullets.count);
    maxEnemies = Math.max(maxEnemies, world.enemies.count);
  }
  frame(60);
  if (screenNow() === 'clear' || isResultScreen()) break;
}

const calls = Object.fromEntries(
  [...drawCalls.entries()].filter(([name]) => !name.startsWith('text:')),
);
const textCalls = [...drawCalls.keys()].filter((name) => name.startsWith('text:')).length;
const summary = {
  frames: Math.round(clock / FRAME_MS),
  canvas: `${gameCanvas.width}x${gameCanvas.height}`,
  drawCalls: calls,
  distinctTexts: textCalls,
  screenAfterRun: screenNow(),
  reachedResult,
  retryVerified,
  pauseVerified,
  resumeVerified,
  hiddenPaused,
  bossSeen,
  maxBullets,
  maxEnemies,
  storageKeys: [...storage.keys()],
  errors: errors.length,
};

console.log(JSON.stringify(summary, null, 2));

check(errors.length === 0, 'runtime errors were thrown');
check(pauseVerified, 'tapping the pause button did not pause the run');
check(resumeVerified, 'tapping resume did not return to the run');
check(reachedResult, 'the run never reached a result screen (no death after 90s)');
check(retryVerified, 'retry from the result screen did not start a new run');
check(hiddenPaused, 'a hidden tab did not auto-pause the run');
check(bossSeen, 'the boss was never spawned');
check(maxBullets > 200, `too few bullets were simulated (max ${maxBullets})`);
check((calls.drawImage ?? 0) > 20000, 'too few drawImage calls; the renderer did not run');
check(textCalls > 0, 'no text was drawn; the UI did not run');
check((calls.setTransform ?? 0) > 100, 'the playfield transform was not applied per frame');
check(storage.size > 0, 'nothing was persisted to localStorage');

if (failures.length > 0) {
  console.error('[smoke] FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('[smoke] OK');
