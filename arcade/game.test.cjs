const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');

test('avanza de la órbita al desierto y luego al laberinto', () => {
  const listeners = {};
  const elements = Object.fromEntries(['stage', 'progress', 'score', 'lives', 'start', 'pad'].map(id => [id, {
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
  let reachedDesert = false, reachedMaze = false;
  let tick = 0;
  for (; tick < 10000; tick++) {
    nextFrame(tick * 16);
    reachedDesert ||= elements.stage.textContent.includes('DESIERTO');
    reachedMaze ||= elements.stage.textContent.includes('LABERINTO');
    if (reachedMaze) break;
  }
  assert.ok(reachedDesert, 'debe llegar al nivel 2');
  assert.ok(reachedMaze, 'debe llegar al nivel 3');
  assert.match(elements.progress.textContent, /JEFE 6\/6/);
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
  move('ArrowRight', 88);
  listeners.keydown({ key: ' ', preventDefault() {} });
  for (let i = 0; i < 400; i++) nextFrame(++tick * 16);
  assert.match(elements.progress.textContent, /JEFE 0\/6/, 'el jefe debe poder ser derrotado');
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

