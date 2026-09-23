const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');

test('avanza de la órbita al desierto y luego al laberinto', () => {
  const listeners = {};
  const elements = Object.fromEntries(['stage', 'timer', 'progress', 'score', 'lives', 'alert', 'start', 'pad'].map(id => [id, {
    textContent: '', hidden: false, addEventListener() {}, querySelectorAll() { return []; }
  }]));
  const context = { fillRect() {}, strokeRect() {}, fillText() {}, set fillStyle(_) {}, set strokeStyle(_) {}, set textAlign(_) {}, set font(_) {} };
  const canvas = { width: 320, height: 480, getContext() { return context; }, addEventListener() {} };
  let nextFrame;
  const predictableMath = Object.create(Math);
  predictableMath.random = () => .5;
  vm.runInNewContext(source, {
    document: { querySelector() { return canvas; }, getElementById(id) { return elements[id]; }, addEventListener(type, fn) { listeners[type] = fn; } },
    window: { addEventListener() {} },
    requestAnimationFrame(fn) { nextFrame = fn; },
    localStorage: { getItem() { return null; }, setItem() {} },
    Math: predictableMath
  });
  listeners.keydown({ key: ' ', preventDefault() {} });
  listeners.keydown({ key: 'ArrowLeft', preventDefault() {} });
  let reachedDesertAt = null, reachedMazeAt = null;
  let tick = 0;
  for (; tick < 20000; tick++) {
    nextFrame(tick * 16);
    if (tick === 42) listeners.keyup({ key: 'ArrowLeft' });
    if (reachedDesertAt === null && elements.stage.textContent.includes('DESIERTO')) reachedDesertAt = tick * 16;
    if (reachedMazeAt === null && elements.stage.textContent.includes('LABERINTO')) reachedMazeAt = tick * 16;
    if (reachedMazeAt !== null) break;
  }
  assert.ok(reachedDesertAt >= 120000, 'el primer nivel debe durar al menos dos minutos');
  assert.ok(reachedMazeAt - reachedDesertAt >= 120000, 'el desierto debe durar al menos dos minutos');
  assert.match(elements.progress.textContent, /JEFE 10\/10/);
  listeners.keyup({ key: ' ' });
  function move(key, frames) {
    listeners.keydown({ key, preventDefault() {} });
    for (let i = 0; i < frames; i++) nextFrame(++tick * 16);
    listeners.keyup({ key });
  }
  move('ArrowUp', 128);
  move('ArrowRight', 32);
  move('ArrowUp', 32);
  move('ArrowLeft', 32);
  move('ArrowUp', 32);
  move('ArrowRight', 32);
  listeners.keydown({ key: ' ', preventDefault() {} });
  for (let i = 0; i < 500; i++) nextFrame(++tick * 16);
  assert.match(elements.progress.textContent, /JEFE 0\/10/, 'el jefe debe poder ser derrotado');
});

test('el laberinto tiene un camino desde el inicio hasta el jefe', () => {
  const rows = source.match(/const maze = \[([\s\S]*?)\];/)[1].match(/'([.#]+)'/g).map(row => row.slice(1, -1));
  assert.equal(rows.length, 15);
  assert.ok(rows.every(row => row.length === 10));
  const seen = new Set(['13,1']);
  const queue = [[13, 1]];
  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = r + dr, nc = c + dc, key = `${nr},${nc}`;
      if (rows[nr]?.[nc] === '.' && !seen.has(key)) { seen.add(key); queue.push([nr, nc]); }
    }
  }
  assert.ok(seen.has('1,7'), 'se puede llegar al pasillo del jefe');
});

test('el service worker guarda el juego y sirve la página sin conexión', async () => {
  const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  const handlers = {}, files = new Map();
  const scope = 'https://istonehn.github.io/istonehn/arcade/';
  const cache = {
    async addAll(paths) { for (const file of paths) files.set(file, { ok: true, name: file }); },
    async put(request, response) { files.set(request.url || request, response); }
  };
  const caches = {
    async open() { return cache; },
    async keys() { return ['star-run-v3']; },
    async delete() { return true; },
    async match(request) { return files.get(request.url || request); }
  };
  vm.runInNewContext(sw, {
    self: { registration: { scope }, location: { origin: 'https://istonehn.github.io' }, clients: { async claim() {} }, async skipWaiting() {}, addEventListener(type, fn) { handlers[type] = fn; } },
    caches, URL,
    fetch() { return Promise.reject(new Error('offline')); }
  });
  let installation;
  handlers.install({ waitUntil(promise) { installation = promise; } });
  await installation;
  assert.ok(files.has('./index.html'));
  assert.ok(files.has('./game.js'));
  let response;
  handlers.fetch({ request: { url: scope, method: 'GET', mode: 'navigate' }, respondWith(promise) { response = promise; } });
  assert.equal((await response).name, './index.html');
});

