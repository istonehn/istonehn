(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const ui = Object.fromEntries(['stage', 'progress', 'score', 'lives', 'start', 'pad'].map(id => [id, document.getElementById(id)]));
  const W = canvas.width, H = canvas.height, CELL = 32;
  const names = ['ÓRBITA', 'DESIERTO', 'LABERINTO'];
  const maze = [
    '##########',
    '#........#',
    '#.###.##.#',
    '#...#....#',
    '###.#.##.#',
    '#...#....#',
    '#.###.##.#',
    '#.....#..#',
    '#.#####.##',
    '#...#....#',
    '#.#.#.##.#',
    '#.#......#',
    '#.######.#',
    '#........#',
    '##########'
  ];
  const stars = Array.from({ length: 50 }, (_, i) => ({ x: (i * 73) % W, y: (i * 137) % H, speed: 14 + (i % 4) * 13, size: i % 7 === 0 ? 2 : 1 }));
  const keys = new Set();
  let mode = 'ready', level = 1, score = 0, lives = 3, progress = 0, best = 0;
  let player = { x: W / 2, y: H - 38, facing: { x: 0, y: -1 } };
  let enemies = [], obstacles = [], shots = [], bossShots = [], particles = [];
  let boss = { x: 272, y: 48, hp: 6, maxHp: 6, t: 0 }, spawnClock = 0, fireClock = 0, bossClock = 0;
  let invulnerable = 0, transitionClock = 0, touchX = null, lastFrame = 0;
  try { best = Number(localStorage.getItem('star-run-best')) || 0; } catch (_) {}

  function hud() {
    ui.stage.textContent = `NIVEL ${level} / ${names[level - 1]}`;
    ui.progress.textContent = level === 3 ? `JEFE ${boss.hp}/${boss.maxHp}` : `OBJETIVO ${progress}/8`;
    ui.score.textContent = `SCORE ${String(score).padStart(4, '0')}`;
    ui.lives.textContent = `VIDAS ${'♥'.repeat(lives)}${'·'.repeat(3 - lives)}`;
  }
  function rememberBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem('star-run-best', String(best)); } catch (_) {}
  }
  function startLevel(next) {
    level = next; mode = 'playing'; progress = 0;
    enemies = []; obstacles = []; shots = []; bossShots = []; particles = [];
    spawnClock = .5; fireClock = 0; bossClock = 1.4; invulnerable = 1;
    player = next === 3 ? { x: 48, y: 432, facing: { x: 0, y: -1 } } : { x: W / 2, y: H - 38, facing: { x: 0, y: -1 } };
    boss = { x: 272, y: 48, hp: 6, maxHp: 6, t: 0 };
    ui.pad.hidden = next !== 3;
    ui.start.textContent = '↻ REINICIAR CAMPAÑA';
    hud();
  }
  function startCampaign() { ui.start.blur?.(); score = 0; lives = 3; startLevel(1); }
  function finish(won) {
    mode = won ? 'won' : 'over';
    rememberBest();
    ui.start.textContent = '▶ JUGAR OTRA VEZ';
    ui.pad.hidden = true;
    hud();
  }
  function advance() {
    if (level === 3) return finish(true);
    mode = 'transition'; transitionClock = 2.4;
    shots = []; enemies = []; obstacles = []; bossShots = [];
  }
  function burst(x, y, color) {
    for (let i = 0; i < 12; i++) particles.push({ x, y, vx: (Math.random() - .5) * 135, vy: (Math.random() - .5) * 135, life: .4, color });
  }
  function collide(a, b, radius) { return Math.abs(a.x - b.x) < radius && Math.abs(a.y - b.y) < radius; }
  function hurt() {
    if (invulnerable > 0 || mode !== 'playing') return;
    lives--; invulnerable = 1.35; burst(player.x, player.y, '#68e4df');
    hud();
    if (lives === 0) finish(false);
  }
  function wall(x, y) {
    const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
    return row < 0 || row >= maze.length || col < 0 || col >= maze[row].length || maze[row][col] === '#';
  }
  function canMove(x, y) {
    return !wall(x - 8, y - 8) && !wall(x + 8, y - 8) && !wall(x - 8, y + 8) && !wall(x + 8, y + 8);
  }
  function fire() {
    if (fireClock > 0 || level === 2) return;
    const dir = level === 3 ? player.facing : { x: 0, y: -1 };
    shots.push({ x: player.x + dir.x * 13, y: player.y + dir.y * 13, vx: dir.x * 270, vy: dir.y * 270, dead: false });
    fireClock = level === 3 ? .22 : .17;
  }
  function movePlayer(dt) {
    const axisX = Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a'));
    const axisY = Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w'));
    if (level !== 3) {
      if (touchX !== null) player.x += (touchX - player.x) * Math.min(1, dt * 12);
      else player.x += axisX * 210 * dt;
      player.x = Math.max(16, Math.min(W - 16, player.x));
      return;
    }
    const speed = 125 / (axisX && axisY ? Math.SQRT2 : 1);
    if (axisX) { player.facing = { x: axisX, y: 0 }; const nx = player.x + axisX * speed * dt; if (canMove(nx, player.y)) player.x = nx; }
    if (axisY) { player.facing = { x: 0, y: axisY }; const ny = player.y + axisY * speed * dt; if (canMove(player.x, ny)) player.y = ny; }
  }
  function updateSpace(dt) {
    spawnClock -= dt;
    if (spawnClock <= 0) {
      enemies.push({ x: 16 + Math.random() * (W - 32), y: -16, speed: 75 + progress * 6, drift: Math.random() * 2 - 1 });
      spawnClock = Math.max(.4, .85 - progress * .04);
    }
    for (const enemy of enemies) {
      enemy.y += enemy.speed * dt; enemy.x += enemy.drift * 18 * dt;
      if (collide(player, enemy, 19)) { enemy.dead = true; hurt(); }
      if (enemy.y > H + 16) enemy.dead = true;
    }
    for (const shot of shots) for (const enemy of enemies) {
      if (!shot.dead && !enemy.dead && collide(shot, enemy, 15)) {
        shot.dead = enemy.dead = true; score += 10; progress++; burst(enemy.x, enemy.y, '#f1c46e'); hud();
      }
    }
    enemies = enemies.filter(e => !e.dead);
    if (mode === 'playing' && progress >= 8) advance();
  }
  function updateDesert(dt) {
    spawnClock -= dt;
    if (spawnClock <= 0) {
      const lane = Math.floor(Math.random() * 4);
      obstacles.push({ x: 40 + lane * 80, y: -20, speed: 155 + progress * 6 });
      spawnClock = Math.max(.5, .9 - progress * .025);
    }
    for (const obstacle of obstacles) {
      obstacle.y += obstacle.speed * dt;
      if (collide(player, obstacle, 25)) { obstacle.dead = true; hurt(); burst(obstacle.x, obstacle.y, '#eeb26a'); }
      if (obstacle.y > H + 20) { obstacle.dead = true; progress++; score += 5; hud(); }
    }
    obstacles = obstacles.filter(o => !o.dead);
    if (mode === 'playing' && progress >= 8) advance();
  }
  function updateMaze(dt) {
    boss.t += dt;
    boss.x = 263 + Math.sin(boss.t * 1.5) * 12;
    bossClock -= dt;
    if (bossClock <= 0) {
      const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
      bossShots.push({ x: boss.x, y: boss.y, vx: Math.cos(angle) * 100, vy: Math.sin(angle) * 100 });
      bossClock = 1.1;
    }
    for (const shot of shots) {
      if (!shot.dead && collide(shot, boss, 17)) {
        shot.dead = true; boss.hp--; score += 25; burst(boss.x, boss.y, '#e77488'); hud();
        if (boss.hp <= 0) { advance(); return; }
      }
    }
    for (const bolt of bossShots) {
      bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt;
      if (wall(bolt.x, bolt.y)) bolt.dead = true;
      else if (collide(bolt, player, 12)) { bolt.dead = true; hurt(); }
    }
    if (collide(boss, player, 20)) hurt();
    bossShots = bossShots.filter(b => !b.dead);
  }
  function update(dt) {
    for (const star of stars) star.y = (star.y + star.speed * dt) % H;
    particles = particles.filter(p => (p.life -= dt) > 0);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; }
    if (mode === 'transition') { transitionClock -= dt; if (transitionClock <= 0) startLevel(level + 1); return; }
    if (mode !== 'playing') return;
    invulnerable = Math.max(0, invulnerable - dt);
    fireClock -= dt;
    movePlayer(dt);
    if ((keys.has(' ') || (touchX !== null && level === 1)) && level !== 2) fire();
    for (const shot of shots) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      if (shot.x < 0 || shot.x > W || shot.y < 0 || shot.y > H || (level === 3 && wall(shot.x, shot.y))) shot.dead = true;
    }
    if (level === 1) updateSpace(dt);
    if (level === 2) updateDesert(dt);
    if (level === 3) updateMaze(dt);
    shots = shots.filter(s => !s.dead);
  }
  function pixel(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  function ship(x, y) {
    pixel(x - 4, y - 15, 8, 8, '#effaff'); pixel(x - 8, y - 7, 16, 10, '#62e1dc');
    pixel(x - 15, y - 1, 30, 8, '#2d9eaa'); pixel(x - 4, y + 7, 8, 8, '#f1c46e');
  }
  function drawBackground() {
    ctx.fillStyle = level === 2 ? '#392a29' : '#07101f'; ctx.fillRect(0, 0, W, H);
    if (level === 2) {
      for (let y = 0; y < H; y += 48) pixel(0, (y + stars[0].y * 2) % H, W, 3, '#76503e');
      pixel(0, 0, 8, H, '#c28b59'); pixel(W - 8, 0, 8, H, '#c28b59');
    } else if (level === 3) {
      for (let row = 0; row < maze.length; row++) for (let col = 0; col < maze[row].length; col++) {
        if (maze[row][col] === '#') {
          pixel(col * CELL, row * CELL, CELL, CELL, '#17344d');
          pixel(col * CELL + 2, row * CELL + 2, CELL - 4, CELL - 4, '#25465c');
        }
      }
    } else for (const star of stars) pixel(star.x, star.y, star.size, star.size, '#7eacbd');
  }
  function overlay(title, subtitle) {
    ctx.fillStyle = '#07101fea'; ctx.fillRect(25, 172, W - 50, 130);
    ctx.strokeStyle = '#56d9d3'; ctx.strokeRect(25, 172, W - 50, 130);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f1c46e'; ctx.font = 'bold 20px monospace'; ctx.fillText(title, W / 2, 221);
    ctx.fillStyle = '#d2e9ee'; ctx.font = '12px monospace'; ctx.fillText(subtitle, W / 2, 253);
  }
  function draw() {
    drawBackground();
    if (level === 1) for (const enemy of enemies) {
      pixel(enemy.x - 12, enemy.y - 5, 24, 9, '#d27279'); pixel(enemy.x - 7, enemy.y - 11, 14, 6, '#f19983');
      pixel(enemy.x - 16, enemy.y + 4, 8, 5, '#a84b67'); pixel(enemy.x + 8, enemy.y + 4, 8, 5, '#a84b67');
    }
    if (level === 2) for (const obstacle of obstacles) {
      pixel(obstacle.x - 18, obstacle.y - 11, 36, 22, '#b46b46'); pixel(obstacle.x - 12, obstacle.y - 15, 24, 6, '#e7a965');
    }
    if (level === 3) {
      pixel(boss.x - 15, boss.y - 15, 30, 30, '#d96982'); pixel(boss.x - 20, boss.y - 6, 40, 14, '#a63f65');
      pixel(boss.x - 9, boss.y - 4, 5, 5, '#fff0a0'); pixel(boss.x + 4, boss.y - 4, 5, 5, '#fff0a0');
      pixel(96, 7, 128, 5, '#693b54'); pixel(96, 7, 128 * boss.hp / boss.maxHp, 5, '#e77488');
      for (const bolt of bossShots) pixel(bolt.x - 3, bolt.y - 3, 6, 6, '#ef7990');
    }
    for (const shot of shots) pixel(shot.x - 2, shot.y - 5, 4, 10, '#f1c46e');
    for (const p of particles) pixel(p.x, p.y, 3, 3, p.color);
    if (mode !== 'playing' || invulnerable === 0 || Math.floor(invulnerable * 10) % 2 === 0) ship(player.x, player.y);
    if (mode === 'ready') overlay('READY, PILOT?', 'Pulsa INICIAR');
    if (mode === 'transition') overlay(`NIVEL ${level + 1}`, level === 1 ? 'ATERRIZA EN EL DESIERTO' : 'EL JEFE TE ESPERA');
    if (mode === 'over') overlay('GAME OVER', `PUNTOS ${score} · RÉCORD ${best}`);
    if (mode === 'won') overlay('MISIÓN COMPLETA', `PUNTOS ${score} · RÉCORD ${best}`);
  }
  function frame(time) {
    const dt = Math.min((time - lastFrame) / 1000 || 0, .04); lastFrame = time;
    update(dt); draw(); requestAnimationFrame(frame);
  }
  function normalized(key) { return key.startsWith('Arrow') ? key : key.toLowerCase(); }
  document.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.preventDefault();
    keys.add(normalized(event.key));
    if ((event.key === 'Enter' || event.key === ' ') && ['ready', 'over', 'won'].includes(mode)) startCampaign();
  });
  document.addEventListener('keyup', event => keys.delete(normalized(event.key)));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', event => {
    if (['ready', 'over', 'won'].includes(mode)) startCampaign();
    if (level !== 3) {
      canvas.setPointerCapture(event.pointerId);
      touchX = (event.clientX - canvas.getBoundingClientRect().left) * W / canvas.getBoundingClientRect().width;
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (touchX !== null) touchX = (event.clientX - canvas.getBoundingClientRect().left) * W / canvas.getBoundingClientRect().width;
  });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { touchX = null; });
  for (const button of ui.pad.querySelectorAll('button')) {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(key); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => keys.delete(key));
  }
  ui.start.addEventListener('click', startCampaign);
  hud(); requestAnimationFrame(frame);
})();

