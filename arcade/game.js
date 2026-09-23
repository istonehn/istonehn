(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const ui = Object.fromEntries(['stage', 'timer', 'progress', 'score', 'lives', 'alert', 'start', 'pad'].map(id => [id, document.getElementById(id)]));
  const W = canvas.width, H = canvas.height, CELL = 32;
  const names = ['ÓRBITA', 'DESIERTO', 'LABERINTO'];
  const durations = [120, 120, 150];
  const covers = [{ x: 36, y: 342, w: 82, h: 15 }, { x: 202, y: 342, w: 82, h: 15 }];
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
  let enemies = [], obstacles = [], aliens = [], shots = [], bossShots = [], particles = [];
  let extraLife = null, lifeDropClock = 0, lifeDropsSpawned = 0;
  let boss = { x: 250, y: 48, hp: 10, maxHp: 10, t: 0 }, spawnClock = 0, fireClock = 0, bossClock = 0, enemyFireClock = 0, alienClock = 0;
  let invulnerable = 0, transitionClock = 0, touchX = null, touchY = null, lastFrame = 0, elapsed = 0, lastHudSecond = -1, lastDesertAlienAt = -20;
  try { best = Number(localStorage.getItem('star-run-best')) || 0; } catch (_) {}
  function lifeDropLimit() { return level === 3 ? 2 : 3; }

  function hud() {
    ui.stage.textContent = `NIVEL ${level} / ${names[level - 1]}`;
    const left = Math.max(0, Math.ceil(durations[level - 1] - elapsed));
    ui.timer.textContent = `TIEMPO ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    ui.progress.textContent = level === 3 ? `JEFE ${boss.hp}/${boss.maxHp}` : level === 2 ? `DUNAS ${progress}` : `NAVES ${progress}`;
    ui.score.textContent = `SCORE ${String(score).padStart(4, '0')}`;
    ui.lives.textContent = `VIDAS ${lives}/4`;
    ui.alert.textContent = extraLife ? lives < 4 ? 'CRUZ ROSA: VIDA EXTRA' : 'CRUZ ROSA: PUNTOS' : level === 1 && attackWave() ? 'FUEGO: BUSCA COBERTURA' : level === 2 ? 'ESQUIVA LAS DUNAS' : level === 3 ? 'ALIENS EN EL CENTRO' : 'ZONA SEGURA';
  }
  function attackWave() { return elapsed >= 25 && (elapsed - 25) % 28 < 9; }
  function rememberBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem('star-run-best', String(best)); } catch (_) {}
  }
  function startLevel(next) {
    level = next; mode = 'playing'; progress = 0; elapsed = 0; lastHudSecond = -1;
    enemies = []; obstacles = []; aliens = []; shots = []; bossShots = []; particles = [];
    extraLife = null; lifeDropClock = 12 + Math.random() * 6; lifeDropsSpawned = 0;
    spawnClock = .5; fireClock = 0; bossClock = 1.4; enemyFireClock = .6; alienClock = 5; invulnerable = 1; lastDesertAlienAt = -20;
    player = next === 3 ? { x: 48, y: 432, facing: { x: 0, y: -1 } } : { x: W / 2, y: H - 38, facing: { x: 0, y: -1 } };
    boss = { x: 250, y: 48, hp: 10, maxHp: 10, t: 0 };
    ui.pad.hidden = next !== 3;
    ui.start.textContent = 'REINICIAR';
    hud();
  }
  function startCampaign() { ui.start.blur?.(); score = 0; lives = 3; startLevel(1); }
  function finish(won) {
    mode = won ? 'won' : 'over';
    rememberBest();
    ui.start.textContent = 'JUGAR OTRA VEZ';
    ui.pad.hidden = true;
    hud();
  }
  function advance() {
    if (level === 3) return finish(true);
    mode = 'transition'; transitionClock = 2.4;
    shots = []; enemies = []; obstacles = []; aliens = []; bossShots = [];
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
  function updateExtraLife(dt) {
    lifeDropClock -= dt;
    if (!extraLife && lifeDropsSpawned < lifeDropLimit() && lifeDropClock <= 0) {
      if (level === 3) {
        const options = [];
        for (let row = 1; row < maze.length - 1; row++) for (let col = 1; col < 9; col++) {
          const x = col * CELL + CELL / 2, y = row * CELL + CELL / 2;
          const distance = Math.hypot(x - player.x, y - player.y);
          if (canMove(x, y) && distance > 24 && distance < 100) options.push({ x, y });
        }
        const spot = options[Math.floor(Math.random() * options.length)];
        if (spot) extraLife = { ...spot, ttl: 20 };
      } else extraLife = { x: 24 + Math.random() * (W - 48), y: 282, ttl: 20 };
      lifeDropClock = 22 + Math.random() * 10;
      if (extraLife) { lifeDropsSpawned++; hud(); }
    }
    if (!extraLife) return;
    extraLife.ttl -= dt;
    if (level !== 3) extraLife.y = Math.min(H - 36, extraLife.y + 35 * dt);
    if (collide(extraLife, player, 18)) {
      if (lives < 4) lives++;
      else score += 25;
      burst(extraLife.x, extraLife.y, '#f18ca0'); extraLife = null; hud();
    } else if (extraLife.ttl <= 0) { extraLife = null; hud(); }
  }
  function wall(x, y) {
    const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
    return row < 0 || row >= maze.length || col < 0 || col >= maze[row].length || maze[row][col] === '#';
  }
  function canMove(x, y) {
    return !wall(x - 8, y - 8) && !wall(x + 8, y - 8) && !wall(x - 8, y + 8) && !wall(x + 8, y + 8);
  }
  function inCover(x, y, margin = 0) {
    return covers.some(c => x >= c.x - margin && x <= c.x + c.w + margin && y >= c.y - margin && y <= c.y + c.h + margin);
  }
  function fire() {
    if (fireClock > 0) return;
    const dir = level === 3 ? player.facing : { x: 0, y: -1 };
    shots.push({ x: player.x + dir.x * 13, y: player.y + dir.y * 13, vx: dir.x * 270, vy: dir.y * 270, dead: false });
    fireClock = level === 3 ? .22 : .17;
  }
  function movePlayer(dt) {
    const axisX = Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a'));
    const axisY = Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w'));
    if (level !== 3) {
      const nx = touchX !== null ? player.x + (touchX - player.x) * Math.min(1, dt * 12) : player.x + axisX * 190 * dt;
      const ny = touchY !== null ? player.y + (touchY - player.y) * Math.min(1, dt * 12) : player.y + axisY * 190 * dt;
      const boundedX = Math.max(16, Math.min(W - 16, nx));
      const boundedY = Math.max(280, Math.min(H - 20, ny));
      if (level !== 1 || !inCover(boundedX, player.y, 10)) player.x = boundedX;
      if (level !== 1 || !inCover(player.x, boundedY, 10)) player.y = boundedY;
      return;
    }
    const speed = 125 / (axisX && axisY ? Math.SQRT2 : 1);
    if (axisX) { player.facing = { x: axisX, y: 0 }; const nx = player.x + axisX * speed * dt; if (canMove(nx, player.y)) player.x = nx; }
    if (axisY) { player.facing = { x: 0, y: axisY }; const ny = player.y + axisY * speed * dt; if (canMove(player.x, ny)) player.y = ny; }
  }
  function updateSpace(dt) {
    spawnClock -= dt;
    if (spawnClock <= 0) {
      enemies.push({ x: 16 + Math.random() * (W - 32), y: -16, speed: 70 + elapsed * .85, drift: Math.random() * 2 - 1 });
      spawnClock = Math.max(.4, .9 - elapsed * .004);
    }
    if (attackWave()) {
      enemyFireClock -= dt;
      if (enemyFireClock <= 0) {
        const origin = enemies.find(e => e.y > 25 && e.y < 230) || { x: 20 + Math.random() * 280, y: 25 };
        hostileShot(origin.x, origin.y, 115 + elapsed * .55);
        enemyFireClock = Math.max(.38, .8 - elapsed * .003);
      }
    } else enemyFireClock = .5;
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
    updateHostileShots(dt, false, true);
  }
  function updateDesert(dt) {
    spawnClock -= dt;
    if (spawnClock <= 0) {
      const lane = Math.floor(Math.random() * 4);
      const hiddenAlien = elapsed - lastDesertAlienAt >= 18 && aliens.length < 2 && Math.random() < .35;
      obstacles.push({ x: 40 + lane * 80, y: -24, speed: 105 + elapsed * 1.1, w: 56 + Math.random() * 14, hiddenAlien, emerged: false, breakable: !hiddenAlien && Math.random() < .4 });
      if (hiddenAlien) lastDesertAlienAt = elapsed;
      spawnClock = Math.max(.48, 1.05 - elapsed * .0045);
    }
    for (const obstacle of obstacles) {
      obstacle.y += obstacle.speed * dt;
      for (const shot of shots) if (obstacle.breakable && !obstacle.dead && !shot.dead && Math.abs(shot.x - obstacle.x) < obstacle.w / 2 && Math.abs(shot.y - obstacle.y) < 16) {
        obstacle.dead = shot.dead = true; progress++; score += 15;
        burst(obstacle.x, obstacle.y, '#f1c46e'); hud();
      }
      if (obstacle.dead) continue;
      if (obstacle.hiddenAlien && !obstacle.emerged && obstacle.y > 170) {
        obstacle.emerged = true;
        aliens.push({ x: obstacle.x, y: obstacle.y, speed: 75, fired: false });
        burst(obstacle.x, obstacle.y, '#b5e878');
      }
      if (Math.abs(player.x - obstacle.x) < obstacle.w / 2 + 8 && Math.abs(player.y - obstacle.y) < 20) {
        obstacle.dead = true; hurt(); burst(obstacle.x, obstacle.y, '#eeb26a');
      }
      if (obstacle.y > H + 20) { obstacle.dead = true; progress++; score += 5; hud(); }
    }
    for (const alien of aliens) {
      alien.y += alien.speed * dt;
      if (!alien.fired && alien.y > 195) { hostileShot(alien.x, alien.y, 120 + elapsed * .3); alien.fired = true; }
      if (collide(alien, player, 17)) { alien.dead = true; hurt(); }
      if (alien.y > H + 20) alien.dead = true;
      for (const shot of shots) if (!shot.dead && !alien.dead && collide(shot, alien, 16)) {
        shot.dead = alien.dead = true; score += 20; burst(alien.x, alien.y, '#b5e878'); hud();
      }
    }
    obstacles = obstacles.filter(o => !o.dead);
    aliens = aliens.filter(a => !a.dead);
    updateHostileShots(dt, false, false);
  }
  function hostileShot(x, y, speed, angleOffset = 0) {
    const angle = Math.atan2(player.y - y, player.x - x) + angleOffset;
    bossShots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
  }
  function updateHostileShots(dt, useWalls, useCover) {
    for (const bolt of bossShots) {
      bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt;
      if (bolt.x < -5 || bolt.x > W + 5 || bolt.y < -5 || bolt.y > H + 5 || (useWalls && wall(bolt.x, bolt.y)) || (useCover && inCover(bolt.x, bolt.y))) bolt.dead = true;
      else if (collide(bolt, player, 12)) { bolt.dead = true; hurt(); }
    }
    bossShots = bossShots.filter(b => !b.dead);
  }
  function updateMaze(dt) {
    boss.t += dt;
    boss.x = 225 + Math.sin(boss.t * 1.7) * 40;
    boss.y = 48 + Math.sin(boss.t * 2.3) * 6;
    bossClock -= dt;
    if (bossClock <= 0) {
      hostileShot(boss.x, boss.y, 120 + elapsed * .4);
      if (boss.hp <= 5) hostileShot(boss.x, boss.y, 120 + elapsed * .4, .22);
      bossClock = Math.max(.45, .9 - elapsed * .003);
    }
    alienClock -= dt;
    if (alienClock <= 0 && aliens.length < 2) {
      const spots = [{ x: 176, y: 240 }, { x: 176, y: 304 }, { x: 176, y: 368 }];
      aliens.push({ ...spots[Math.floor(Math.random() * spots.length)], speed: 43 + elapsed * .1 });
      alienClock = Math.max(13, 20 - elapsed * .03);
    }
    for (const alien of aliens) {
      const dx = player.x - alien.x, dy = player.y - alien.y;
      const step = alien.speed * dt;
      const nx = alien.x + Math.sign(dx) * step, ny = alien.y + Math.sign(dy) * step;
      if (Math.abs(dx) > Math.abs(dy) && canMove(nx, alien.y)) alien.x = nx;
      else if (canMove(alien.x, ny)) alien.y = ny;
      else if (canMove(nx, alien.y)) alien.x = nx;
      if (collide(alien, player, 15)) { alien.dead = true; hurt(); }
      for (const shot of shots) if (!shot.dead && !alien.dead && collide(shot, alien, 14)) {
        shot.dead = alien.dead = true; score += 15; burst(alien.x, alien.y, '#b5e878'); hud();
      }
    }
    aliens = aliens.filter(a => !a.dead);
    for (const shot of shots) {
      if (!shot.dead && collide(shot, boss, 17)) {
        shot.dead = true; boss.hp--; score += 25; burst(boss.x, boss.y, '#e77488'); hud();
        if (boss.hp <= 0) { advance(); return; }
      }
    }
    updateHostileShots(dt, true, false);
    if (collide(boss, player, 20)) hurt();
  }
  function update(dt) {
    for (const star of stars) star.y = (star.y + star.speed * dt) % H;
    particles = particles.filter(p => (p.life -= dt) > 0);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; }
    if (mode === 'transition') { transitionClock -= dt; if (transitionClock <= 0) startLevel(level + 1); return; }
    if (mode !== 'playing') return;
    elapsed += dt;
    if (Math.floor(elapsed) !== lastHudSecond) { lastHudSecond = Math.floor(elapsed); hud(); }
    invulnerable = Math.max(0, invulnerable - dt);
    fireClock -= dt;
    movePlayer(dt);
    updateExtraLife(dt);
    if (keys.has(' ') || (touchX !== null && level !== 3)) fire();
    for (const shot of shots) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      if (shot.x < 0 || shot.x > W || shot.y < 0 || shot.y > H || (level === 3 && wall(shot.x, shot.y)) || (level === 1 && inCover(shot.x, shot.y))) shot.dead = true;
    }
    if (level === 1) updateSpace(dt);
    if (level === 2) updateDesert(dt);
    if (level === 3) updateMaze(dt);
    shots = shots.filter(s => !s.dead);
    if (mode === 'playing' && elapsed >= durations[level - 1]) {
      if (level === 3) finish(false); else advance();
    }
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
    if (level === 1) for (const c of covers) {
      pixel(c.x, c.y, c.w, c.h, '#2a6775'); pixel(c.x + 4, c.y + 3, c.w - 8, 5, '#66c8c5');
    }
    if (level === 2) for (const obstacle of obstacles) {
      pixel(obstacle.x - obstacle.w / 2, obstacle.y - 6, obstacle.w, 20, obstacle.breakable ? '#d09257' : '#b46b46');
      pixel(obstacle.x - obstacle.w / 3, obstacle.y - 12, obstacle.w * 2 / 3, 8, '#e7a965');
      if (obstacle.breakable) {
        pixel(obstacle.x - 4, obstacle.y - 6, 8, 4, '#fff0ae');
        pixel(obstacle.x + 1, obstacle.y - 2, 4, 7, '#fff0ae');
        pixel(obstacle.x - 6, obstacle.y + 4, 8, 4, '#fff0ae');
      }
      if (obstacle.hiddenAlien && !obstacle.emerged) pixel(obstacle.x - 3, obstacle.y - 8, 6, 3, '#b5e878');
    }
    if (level === 3) {
      pixel(boss.x - 15, boss.y - 15, 30, 30, '#d96982'); pixel(boss.x - 20, boss.y - 6, 40, 14, '#a63f65');
      pixel(boss.x - 9, boss.y - 4, 5, 5, '#fff0a0'); pixel(boss.x + 4, boss.y - 4, 5, 5, '#fff0a0');
      pixel(96, 7, 128, 5, '#693b54'); pixel(96, 7, 128 * boss.hp / boss.maxHp, 5, '#e77488');
    }
    for (const alien of aliens) {
      pixel(alien.x - 9, alien.y - 8, 18, 15, '#a3dc70');
      pixel(alien.x - 6, alien.y - 4, 4, 4, '#152e32'); pixel(alien.x + 2, alien.y - 4, 4, 4, '#152e32');
      pixel(alien.x - 12, alien.y + 5, 6, 5, '#5d9c64'); pixel(alien.x + 6, alien.y + 5, 6, 5, '#5d9c64');
    }
    if (extraLife) {
      pixel(extraLife.x - 11, extraLife.y - 9, 22, 18, '#f18ca0');
      pixel(extraLife.x - 3, extraLife.y - 4, 6, 12, '#162438');
      pixel(extraLife.x - 7, extraLife.y, 14, 4, '#162438');
    }
    for (const bolt of bossShots) pixel(bolt.x - 3, bolt.y - 3, 6, 6, '#ef7990');
    for (const shot of shots) pixel(shot.x - 2, shot.y - 5, 4, 10, '#f1c46e');
    for (const p of particles) pixel(p.x, p.y, 3, 3, p.color);
    if (mode !== 'playing' || invulnerable === 0 || Math.floor(invulnerable * 10) % 2 === 0) ship(player.x, player.y);
    if (mode === 'ready') overlay('READY, PILOT?', 'Pulsa INICIAR');
    if (mode === 'transition') overlay(`NIVEL ${level + 1}`, level === 1 ? 'ATERRIZA EN EL DESIERTO' : 'EL JEFE TE ESPERA');
    if (mode === 'over') overlay('GAME OVER', `PUNTOS ${score} / RECORD ${best}`);
    if (mode === 'won') overlay('MISIÓN COMPLETA', `PUNTOS ${score} / RECORD ${best}`);
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
  function touchTarget(event) {
    const rect = canvas.getBoundingClientRect();
    touchX = (event.clientX - rect.left) * W / rect.width;
    touchY = (event.clientY - rect.top) * H / rect.height;
  }
  canvas.addEventListener('pointerdown', event => {
    if (['ready', 'over', 'won'].includes(mode)) startCampaign();
    if (level !== 3) {
      canvas.setPointerCapture(event.pointerId);
      touchTarget(event);
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (touchX !== null) touchTarget(event);
  });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { touchX = null; touchY = null; });
  for (const button of ui.pad.querySelectorAll('button')) {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(key); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => keys.delete(key));
  }
  ui.start.addEventListener('click', startCampaign);
  hud(); requestAnimationFrame(frame);
})();
