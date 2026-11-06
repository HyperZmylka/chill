/* Mini Gierki — lekkie gry canvas działające lokalnie w Chill. */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const CATALOG = Object.freeze([
    Object.freeze({
      id: 'last-circle',
      titlePl: 'Ostatni Krąg',
      titleEn: 'Last Circle',
      genrePl: 'Battle Royale',
      genreEn: 'Battle Royale',
      taglinePl: '12 graczy. Kurcząca się strefa. Tylko jedno miejsce dla zwycięzcy.',
      taglineEn: '12 players. A shrinking storm. Room for only one winner.',
      descriptionPl: 'Wskocz na arenę, zbieraj broń i przetrwaj do końca. Twoja własna, lekka wersja battle royale — bez instalowania ogromnego klienta.',
      descriptionEn: 'Drop into the arena, grab a weapon and survive to the end. Your own lightweight battle royale — no huge client required.',
      tagsPl: ['Battle Royale', '12 graczy', 'Boty'],
      tagsEn: ['Battle Royale', '12 players', 'Bots'],
      controlsPl: 'WASD — ruch • Mysz — celowanie • LPM / Spacja — strzał • Shift — sprint',
      controlsEn: 'WASD — move • Mouse — aim • LMB / Space — shoot • Shift — sprint',
      icon: '🪂',
      accent: '#3ee0a3',
    }),
    Object.freeze({
      id: 'duel',
      titlePl: 'Pojedynek 1v1',
      titleEn: '1v1 Duel',
      genrePl: 'Arena 1v1',
      genreEn: '1v1 Arena',
      taglinePl: 'Trzy rundy. Jeden przeciwnik. Kto zostanie na placu?',
      taglineEn: 'Three rounds. One opponent. Who stays standing?',
      descriptionPl: 'Szybka arena jeden na jednego. Unikaj, celuj i wygraj dwie rundy, zanim zrobi to bot.',
      descriptionEn: 'A fast one-on-one arena. Dodge, aim and win two rounds before the bot does.',
      tagsPl: ['1v1', 'Do 2 wygranych', 'Bot'],
      tagsEn: ['1v1', 'First to 2', 'Bot'],
      controlsPl: 'WASD — ruch • Mysz — celowanie • LPM — strzał • Shift — unik',
      controlsEn: 'WASD — move • Mouse — aim • LMB — shoot • Shift — dash',
      icon: '⚔️',
      accent: '#ff7aa2',
    }),
  ]);
  const CATALOG_BY_ID = new Map(CATALOG.map((game) => [game.id, game]));

  const WEAPONS = Object.freeze({
    pistol: Object.freeze({ id: 'pistol', namePl: 'Pistolet', nameEn: 'Pistol', damage: 18, fireRate: 0.28, speed: 980, spread: 0.025, pellets: 1, color: '#9ef7cf' }),
    smg: Object.freeze({ id: 'smg', namePl: 'SMG', nameEn: 'SMG', damage: 10, fireRate: 0.085, speed: 1050, spread: 0.075, pellets: 1, color: '#7cc8ff' }),
    shotgun: Object.freeze({ id: 'shotgun', namePl: 'Strzelba', nameEn: 'Shotgun', damage: 8, fireRate: 0.75, speed: 840, spread: 0.2, pellets: 6, color: '#ffd166' }),
    rifle: Object.freeze({ id: 'rifle', namePl: 'Karabin', nameEn: 'Rifle', damage: 25, fireRate: 0.22, speed: 1320, spread: 0.012, pellets: 1, color: '#ff9f7a' }),
  });
  const WEAPON_IDS = Object.freeze(Object.keys(WEAPONS));
  const LOOT_WEAPONS = Object.freeze(['smg', 'shotgun', 'rifle']);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  function normalizeInstalled(value) {
    let list = value;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch { list = []; }
    }
    if (!Array.isArray(list)) return [];
    const result = [];
    const seen = new Set();
    for (const item of list) {
      const id = typeof item === 'string' ? item : '';
      if (!id || seen.has(id) || !CATALOG_BY_ID.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }

  function stormRadius(startRadius, minRadius, elapsed, duration, hold = 0) {
    const start = Math.max(0, Number(startRadius) || 0);
    const min = clamp(Number(minRadius) || 0, 0, start);
    const holdTime = Math.max(0, Number(hold) || 0);
    const shrinkTime = Math.max(0.0001, Number(duration) || 0);
    const time = Math.max(0, Number(elapsed) || 0);
    if (time <= holdTime) return start;
    const progress = clamp((time - holdTime) / shrinkTime, 0, 1);
    return start + (min - start) * progress;
  }

  function segmentHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return distance(x1, y1, cx, cy) <= radius;
    const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / lengthSq, 0, 1);
    return distance(x1 + dx * t, y1 + dy * t, cx, cy) <= radius;
  }

  const GAME_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'ShiftLeft', 'ShiftRight',
  ]);

  class MiniGameBase {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.options = options || {};
      this.lang = options.language === 'en' ? 'en' : 'pl';
      this.keys = new Set();
      this.mouse = { x: 0, y: 0, down: false, seen: false };
      this.view = { w: 1, h: 1, dpr: 1 };
      this.time = 0;
      this.hudClock = 0;
      this.running = false;
      this.paused = false;
      this.ended = false;
      this.destroyed = false;
      this.last = 0;
      this.raf = 0;
      this.frameCallback = (time) => this.frame(time);
      this.bindEvents();
      this.resize();
    }

    t(pl, en) {
      return this.lang === 'en' ? en : pl;
    }

    weaponName(id) {
      const weapon = WEAPONS[id];
      return weapon ? this.t(weapon.namePl, weapon.nameEn) : '';
    }

    bindEvents() {
      this.handleKeyDown = (event) => {
        if (this.destroyed) return;
        if (GAME_KEYS.has(event.code)) event.preventDefault();
        this.keys.add(event.code);
      };
      this.handleKeyUp = (event) => {
        this.keys.delete(event.code);
      };
      this.handlePointerMove = (event) => {
        if (this.destroyed) return;
        const rect = this.canvas.getBoundingClientRect();
        const point = this.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
        this.mouse.x = point.x;
        this.mouse.y = point.y;
        this.mouse.seen = true;
      };
      this.handlePointerDown = (event) => {
        if (this.destroyed || event.button !== 0) return;
        event.preventDefault();
        this.handlePointerMove(event);
        this.mouse.down = true;
        try { this.canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }
        try { this.canvas.focus({ preventScroll: true }); } catch { /* ignore */ }
      };
      this.handlePointerUp = () => {
        this.mouse.down = false;
      };
      this.handleWindowBlur = () => {
        this.keys.clear();
        this.mouse.down = false;
      };
      this.handleResize = () => this.resize();

      window.addEventListener('keydown', this.handleKeyDown, { passive: false });
      window.addEventListener('keyup', this.handleKeyUp);
      window.addEventListener('pointerup', this.handlePointerUp);
      window.addEventListener('blur', this.handleWindowBlur);
      window.addEventListener('resize', this.handleResize);
      this.canvas.addEventListener('pointermove', this.handlePointerMove);
      this.canvas.addEventListener('pointerdown', this.handlePointerDown);
      this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    unbindEvents() {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('blur', this.handleWindowBlur);
      window.removeEventListener('resize', this.handleResize);
      this.canvas.removeEventListener('pointermove', this.handlePointerMove);
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.view = { w: width, h: height, dpr };
    }

    start() {
      if (this.destroyed || this.ended || this.running) return;
      this.paused = false;
      this.running = true;
      this.last = performance.now();
      this.emitHud(true);
      this.frame(this.last);
    }

    pause() {
      if (this.destroyed || this.ended) return;
      this.paused = true;
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.emitHud(true);
    }

    resume() {
      if (this.destroyed || this.ended || this.running) return;
      this.paused = false;
      this.running = true;
      this.last = performance.now();
      this.frame(this.last);
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.running = false;
      this.paused = false;
      cancelAnimationFrame(this.raf);
      this.unbindEvents();
    }

    frame(time) {
      if (!this.running || this.paused || this.destroyed) return;
      const dt = clamp((time - this.last) / 1000, 0, 0.05);
      this.last = time;
      this.time += dt;
      this.update(dt);
      if (this.destroyed) return;
      this.draw();
      this.hudClock += dt;
      if (this.hudClock >= 0.1) {
        this.hudClock = 0;
        this.emitHud(true);
      }
      if (this.running && !this.paused && !this.destroyed) {
        this.raf = requestAnimationFrame(this.frameCallback);
      }
    }

    emitHud(force = false) {
      if (!this.options.onHud || this.destroyed) return;
      if (!force && this.hudClock < 0.1) return;
      this.options.onHud(this.hudState());
    }

    finish(result) {
      if (this.ended) return;
      this.ended = true;
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.emitHud(true);
      if (this.options.onEnd) this.options.onEnd(result);
    }

    hudState() {
      return { mode: 'unknown' };
    }

    update() {}

    draw() {}

    screenToWorld(x, y) {
      return { x, y };
    }
  }

  class BattleGame extends MiniGameBase {
    constructor(canvas, options) {
      super(canvas, options);
      this.world = { w: 2400, h: 1600 };
      this.center = { x: 1200, y: 800 };
      this.camera = { x: 0, y: 0 };
      this.storm = { start: 1120, min: 140, hold: 7, duration: 92, elapsed: 0 };
      this.obstacles = [];
      this.crates = [];
      this.pickups = [];
      this.bullets = [];
      this.particles = [];
      this.shake = 0;
      this.createWorld();
      this.player = this.createPlayer();
      this.bots = this.createBots(11);
      this.emitHud(true);
    }

    findSpot(avoid = [], margin = 80) {
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const x = margin + Math.random() * (this.world.w - margin * 2);
        const y = margin + Math.random() * (this.world.h - margin * 2);
        if (this.obstacles.some((item) => distance(x, y, item.x, item.y) < item.r + 56)) continue;
        if (avoid.some((item) => distance(x, y, item.x, item.y) < (item.r || 0) + 56)) continue;
        return { x, y };
      }
      return { x: this.center.x, y: this.center.y };
    }

    createWorld() {
      for (let index = 0; index < 26; index += 1) {
        const spot = this.findSpot([{ x: 1200, y: 1080, r: 170 }], 110);
        this.obstacles.push({
          x: spot.x,
          y: spot.y,
          r: 18 + Math.random() * 24,
          shade: 0.65 + Math.random() * 0.35,
        });
      }
      for (let index = 0; index < 12; index += 1) {
        const spot = this.findSpot([{ x: 1200, y: 1080, r: 150 }], 120);
        this.crates.push({
          x: spot.x,
          y: spot.y,
          r: 16,
          opened: false,
          angle: Math.random() * TAU,
        });
      }
    }

    createPlayer() {
      return {
        id: 0,
        isPlayer: true,
        name: this.t('Ty', 'You'),
        x: 1200,
        y: 1080,
        r: 16,
        hp: 100,
        shield: 0,
        angle: -Math.PI / 2,
        weapon: 'pistol',
        cooldown: 0,
        alive: true,
        kills: 0,
        color: '#3ee0a3',
        speed: 235,
      };
    }

    createBots(count) {
      const colors = ['#ff7a7a', '#ffb86b', '#c7a1ff', '#67d8ff', '#ff8ac9', '#97e36f', '#f4d35e', '#9aa7ff', '#ff9f7a', '#7ce7d2', '#d3a4ff'];
      const weapons = ['pistol', 'pistol', 'smg', 'smg', 'rifle', 'pistol', 'shotgun', 'smg', 'rifle', 'pistol', 'shotgun'];
      const bots = [];
      for (let index = 0; index < count; index += 1) {
        let x = 0;
        let y = 0;
        for (let attempt = 0; attempt < 120; attempt += 1) {
          const spot = this.findSpot([], 120);
          if (distance(spot.x, spot.y, 1200, 1080) < 420) continue;
          if (bots.some((bot) => distance(spot.x, spot.y, bot.x, bot.y) < 110)) continue;
          x = spot.x;
          y = spot.y;
          break;
        }
        if (!x && !y) {
          x = 300 + Math.random() * (this.world.w - 600);
          y = 240 + Math.random() * (this.world.h - 480);
        }
        bots.push({
          id: index + 1,
          isPlayer: false,
          name: `Bot ${index + 1}`,
          x,
          y,
          r: 14,
          hp: 100,
          shield: index % 4 === 0 ? 30 : 0,
          angle: Math.random() * TAU,
          weapon: weapons[index % weapons.length],
          cooldown: 0.4 + Math.random(),
          alive: true,
          color: colors[index % colors.length],
          speed: 160 + Math.random() * 38,
          aimError: 0.1 + Math.random() * 0.09,
          think: Math.random() * 0.4,
          targetId: null,
          strafeDir: Math.random() < 0.5 ? -1 : 1,
          wanderAngle: Math.random() * TAU,
          seed: Math.random() * 100,
        });
      }
      return bots;
    }

    entities() {
      return this.player.alive ? [this.player, ...this.bots.filter((bot) => bot.alive)] : this.bots.filter((bot) => bot.alive);
    }

    entityById(id) {
      if (id === 0) return this.player;
      return this.bots.find((bot) => bot.id === id) || null;
    }

    aliveCount() {
      return this.bots.reduce((total, bot) => total + (bot.alive ? 1 : 0), this.player.alive ? 1 : 0);
    }

    currentStormRadius() {
      return stormRadius(this.storm.start, this.storm.min, this.storm.elapsed, this.storm.duration, this.storm.hold);
    }

    hitsObstacle(x, y, radius) {
      return this.obstacles.some((item) => distance(x, y, item.x, item.y) < item.r + radius);
    }

    hasLineOfSight(x1, y1, x2, y2) {
      return !this.obstacles.some((item) => segmentHitsCircle(x1, y1, x2, y2, item.x, item.y, item.r + 3));
    }

    moveEntity(entity, dx, dy) {
      const nextX = clamp(entity.x + dx, entity.r, this.world.w - entity.r);
      if (!this.hitsObstacle(nextX, entity.y, entity.r)) entity.x = nextX;
      const nextY = clamp(entity.y + dy, entity.r, this.world.h - entity.r);
      if (!this.hitsObstacle(entity.x, nextY, entity.r)) entity.y = nextY;
    }

    spawnParticles(x, y, color, count, speed = 130) {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * TAU;
        const velocity = speed * (0.35 + Math.random() * 0.8);
        const life = 0.25 + Math.random() * 0.35;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life,
          maxLife: life,
          color,
          size: 1.5 + Math.random() * 2.5,
        });
      }
    }

    shoot(entity, weaponId, angle) {
      const weapon = WEAPONS[weaponId] || WEAPONS.pistol;
      entity.cooldown = weapon.fireRate;
      for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
        const shotAngle = angle + (Math.random() - 0.5) * weapon.spread * 2;
        const offset = entity.r + 7;
        this.bullets.push({
          x: entity.x + Math.cos(shotAngle) * offset,
          y: entity.y + Math.sin(shotAngle) * offset,
          vx: Math.cos(shotAngle) * weapon.speed,
          vy: Math.sin(shotAngle) * weapon.speed,
          damage: weapon.damage * (entity.isPlayer ? 1 : 0.82),
          ownerId: entity.id,
          color: weapon.color,
          life: 1.15,
        });
      }
      this.spawnParticles(
        entity.x + Math.cos(angle) * (entity.r + 8),
        entity.y + Math.sin(angle) * (entity.r + 8),
        weapon.color,
        weapon.pellets > 1 ? 6 : 3,
        90,
      );
      if (entity.isPlayer) this.shake = Math.min(1.2, this.shake + 0.16);
    }

    damageEntity(entity, amount, ownerId) {
      if (!entity || !entity.alive || amount <= 0) return;
      const absorbed = Math.min(entity.shield, amount);
      entity.shield -= absorbed;
      entity.hp -= amount - absorbed;
      if (entity.hp <= 0) this.killEntity(entity, ownerId);
    }

    killEntity(entity, ownerId) {
      if (!entity.alive) return;
      entity.alive = false;
      entity.hp = 0;
      entity.shield = 0;
      this.spawnParticles(entity.x, entity.y, entity.color, entity.isPlayer ? 22 : 16, 190);
      if (entity.isPlayer) {
        this.shake = 1.2;
        return;
      }
      const killer = this.entityById(ownerId);
      if (killer?.isPlayer) this.player.kills += 1;
      if (Math.random() < 0.7) {
        this.pickups.push({
          x: entity.x + (Math.random() - 0.5) * 18,
          y: entity.y + (Math.random() - 0.5) * 18,
          type: Math.random() < 0.55 ? 'health' : 'weapon',
          weapon: LOOT_WEAPONS[Math.floor(Math.random() * LOOT_WEAPONS.length)],
          r: 13,
          phase: Math.random() * TAU,
          dead: false,
        });
      }
    }

    applyPickup(entity, pickup) {
      if (pickup.type === 'health') {
        entity.hp = Math.min(100, entity.hp + 35);
      } else if (pickup.type === 'shield') {
        entity.shield = Math.min(60, entity.shield + 30);
      } else if (pickup.type === 'weapon') {
        entity.weapon = pickup.weapon || 'smg';
      }
      this.spawnParticles(pickup.x, pickup.y, pickup.type === 'health' ? '#79f2a8' : pickup.type === 'shield' ? '#7cc8ff' : '#ffd166', 10, 110);
    }

    openCrate(crate) {
      crate.opened = true;
      const roll = Math.random();
      if (roll < 0.42) {
        this.pickups.push({
          x: crate.x,
          y: crate.y,
          type: 'weapon',
          weapon: LOOT_WEAPONS[Math.floor(Math.random() * LOOT_WEAPONS.length)],
          r: 14,
          phase: Math.random() * TAU,
          dead: false,
        });
      } else if (roll < 0.72) {
        this.pickups.push({ x: crate.x, y: crate.y, type: 'shield', r: 13, phase: Math.random() * TAU, dead: false });
      } else {
        this.pickups.push({ x: crate.x, y: crate.y, type: 'health', r: 13, phase: Math.random() * TAU, dead: false });
      }
      this.spawnParticles(crate.x, crate.y, '#ffd166', 12, 130);
    }

    updatePlayer(dt) {
      const player = this.player;
      player.cooldown = Math.max(0, player.cooldown - dt);
      if (!player.alive) return;
      let dx = 0;
      let dy = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
      const length = Math.hypot(dx, dy);
      const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = sprinting ? 320 : player.speed;
      if (length > 0) {
        this.moveEntity(player, (dx / length) * speed * dt, (dy / length) * speed * dt);
      }
      if (this.mouse.seen) {
        player.angle = Math.atan2(this.mouse.y - player.y, this.mouse.x - player.x);
      }
      if ((this.mouse.down || this.keys.has('Space')) && player.cooldown <= 0) {
        this.shoot(player, player.weapon, player.angle);
      }
    }

    findBotTarget(bot) {
      let best = null;
      let bestDistance = 760;
      for (const entity of this.entities()) {
        if (entity.id === bot.id) continue;
        const dist = distance(bot.x, bot.y, entity.x, entity.y);
        if (dist < bestDistance) {
          best = entity;
          bestDistance = dist;
        }
      }
      return best;
    }

    updateBot(bot, dt, radius) {
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      if (!bot.alive) return;
      const stormDistance = distance(bot.x, bot.y, this.center.x, this.center.y);
      const outside = stormDistance > radius - 40;
      let moveX = 0;
      let moveY = 0;

      if (outside) {
        const dx = this.center.x - bot.x;
        const dy = this.center.y - bot.y;
        const length = Math.hypot(dx, dy) || 1;
        moveX = dx / length;
        moveY = dy / length;
        bot.angle = Math.atan2(dy, dx);
      } else {
        bot.think -= dt;
        if (bot.think <= 0) {
          bot.think = 0.3 + Math.random() * 0.45;
          bot.targetId = this.findBotTarget(bot)?.id ?? null;
          if (Math.random() < 0.25) bot.strafeDir *= -1;
        }
        const target = bot.targetId === null ? null : this.entityById(bot.targetId);
        if (target?.alive) {
          const dx = target.x - bot.x;
          const dy = target.y - bot.y;
          const dist = Math.hypot(dx, dy) || 1;
          const aim = Math.atan2(dy, dx);
          bot.angle = aim + Math.sin(this.time * 3.2 + bot.seed) * bot.aimError;
          const visible = this.hasLineOfSight(bot.x, bot.y, target.x, target.y);
          if (visible && dist < 640 && bot.cooldown <= 0) {
            this.shoot(bot, bot.weapon, bot.angle);
          }
          let forward = 0;
          if (dist > 370) forward = 1;
          else if (dist < 190) forward = -1;
          const strafe = bot.strafeDir;
          moveX = (dx / dist) * forward + (-dy / dist) * strafe * 0.72;
          moveY = (dy / dist) * forward + (dx / dist) * strafe * 0.72;
        } else {
          bot.wanderAngle += (Math.random() - 0.5) * dt * 1.8;
          const dx = this.center.x - bot.x;
          const dy = this.center.y - bot.y;
          const length = Math.hypot(dx, dy) || 1;
          moveX = (dx / length) * 0.55 + Math.cos(bot.wanderAngle) * 0.55;
          moveY = (dy / length) * 0.55 + Math.sin(bot.wanderAngle) * 0.55;
          bot.angle = Math.atan2(moveY, moveX);
        }
      }

      const moveLength = Math.hypot(moveX, moveY);
      if (moveLength > 0.01) {
        const factor = (bot.speed * dt) / moveLength;
        this.moveEntity(bot, moveX * factor, moveY * factor);
      }
    }

    updateBullets(dt) {
      const entities = this.entities();
      for (const bullet of this.bullets) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.life -= dt;
        if (bullet.life <= 0 || bullet.x < 0 || bullet.y < 0 || bullet.x > this.world.w || bullet.y > this.world.h) {
          bullet.dead = true;
          continue;
        }
        if (this.hitsObstacle(bullet.x, bullet.y, 2)) {
          bullet.dead = true;
          this.spawnParticles(bullet.x, bullet.y, bullet.color, 2, 70);
          continue;
        }
        for (const entity of entities) {
          if (entity.id === bullet.ownerId || !entity.alive) continue;
          if (distance(bullet.x, bullet.y, entity.x, entity.y) <= entity.r + 3) {
            this.damageEntity(entity, bullet.damage, bullet.ownerId);
            this.spawnParticles(bullet.x, bullet.y, bullet.color, 4, 100);
            bullet.dead = true;
            break;
          }
        }
      }
      if (this.bullets.some((bullet) => bullet.dead)) {
        this.bullets = this.bullets.filter((bullet) => !bullet.dead);
      }
    }

    updatePickups(dt) {
      const entities = this.entities();
      for (const pickup of this.pickups) {
        pickup.phase += dt * 3;
        if (pickup.dead) continue;
        for (const entity of entities) {
          if (distance(pickup.x, pickup.y, entity.x, entity.y) <= pickup.r + entity.r + 6) {
            this.applyPickup(entity, pickup);
            pickup.dead = true;
            break;
          }
        }
      }
      if (this.pickups.some((pickup) => pickup.dead)) {
        this.pickups = this.pickups.filter((pickup) => !pickup.dead);
      }
      for (const crate of this.crates) {
        if (crate.opened) continue;
        for (const entity of entities) {
          if (distance(crate.x, crate.y, entity.x, entity.y) <= crate.r + entity.r + 8) {
            this.openCrate(crate);
            break;
          }
        }
      }
    }

    updateParticles(dt) {
      for (const particle of this.particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.96;
        particle.vy *= 0.96;
        particle.life -= dt;
      }
      if (this.particles.some((particle) => particle.life <= 0)) {
        this.particles = this.particles.filter((particle) => particle.life > 0);
      }
    }

    applyStorm(dt, radius) {
      for (const entity of this.entities()) {
        if (distance(entity.x, entity.y, this.center.x, this.center.y) > radius) {
          this.damageEntity(entity, 8 * dt, null);
        }
      }
    }

    update(dt) {
      if (this.ended) return;
      this.storm.elapsed += dt;
      const radius = this.currentStormRadius();
      this.updatePlayer(dt);
      for (const bot of this.bots) this.updateBot(bot, dt, radius);
      this.updateBullets(dt);
      this.updatePickups(dt);
      this.updateParticles(dt);
      this.applyStorm(dt, radius);
      this.shake = Math.max(0, this.shake - dt * 3.4);
      if (!this.player.alive) {
        this.finish({
          mode: 'battle',
          winner: 'bot',
          placement: this.aliveCount() + 1,
          kills: this.player.kills,
        });
      } else if (this.bots.every((bot) => !bot.alive)) {
        this.finish({
          mode: 'battle',
          winner: 'player',
          placement: 1,
          kills: this.player.kills,
        });
      }
    }

    hudState() {
      const radius = this.currentStormRadius();
      const outside = distance(this.player.x, this.player.y, this.center.x, this.center.y) > radius;
      let stormLabel;
      if (this.storm.elapsed < this.storm.hold) {
        stormLabel = this.t(`Strefa za ${Math.ceil(this.storm.hold - this.storm.elapsed)} s`, `Storm in ${Math.ceil(this.storm.hold - this.storm.elapsed)}s`);
      } else if (radius <= this.storm.min + 1) {
        stormLabel = this.t('Strefa minimalna', 'Final storm');
      } else {
        stormLabel = this.t('Strefa się kurczy', 'Storm shrinking');
      }
      return {
        mode: 'battle',
        playerName: this.t('Ty', 'You'),
        hp: Math.max(0, Math.ceil(this.player.hp)),
        shield: Math.max(0, Math.ceil(this.player.shield)),
        alive: this.aliveCount(),
        kills: this.player.kills,
        weapon: this.weaponName(this.player.weapon),
        stormLabel,
        outside,
      };
    }

    draw() {
      const ctx = this.ctx;
      const { w, h } = this.view;
      if (w < 2 || h < 2) return;
      const maxX = Math.max(0, this.world.w - w);
      const maxY = Math.max(0, this.world.h - h);
      const cameraX = maxX > 0 ? clamp(this.player.x - w / 2, 0, maxX) : (this.world.w - w) / 2;
      const cameraY = maxY > 0 ? clamp(this.player.y - h / 2, 0, maxY) : (this.world.h - h) / 2;
      this.camera.x = cameraX;
      this.camera.y = cameraY;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#050c09';
      ctx.fillRect(0, 0, w, h);

      const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 9 : 0;
      const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 9 : 0;
      ctx.save();
      ctx.translate(-cameraX + shakeX, -cameraY + shakeY);

      const background = ctx.createLinearGradient(0, 0, this.world.w, this.world.h);
      background.addColorStop(0, '#07130e');
      background.addColorStop(0.55, '#081711');
      background.addColorStop(1, '#0b1020');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, this.world.w, this.world.h);

      ctx.strokeStyle = 'rgba(62, 224, 163, 0.065)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= this.world.w; x += 80) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.world.h);
      }
      for (let y = 0; y <= this.world.h; y += 80) {
        ctx.moveTo(0, y);
        ctx.lineTo(this.world.w, y);
      }
      ctx.stroke();

      const radius = this.currentStormRadius();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.world.w, this.world.h);
      ctx.arc(this.center.x, this.center.y, radius, 0, TAU, true);
      ctx.fillStyle = 'rgba(122, 67, 224, 0.23)';
      ctx.fill('evenodd');
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, radius, 0, TAU);
      ctx.strokeStyle = 'rgba(190, 140, 255, 0.85)';
      ctx.lineWidth = 4;
      ctx.setLineDash([20, 14]);
      ctx.lineDashOffset = -this.time * 24;
      ctx.shadowColor = 'rgba(160, 96, 255, 0.75)';
      ctx.shadowBlur = 22;
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = 'rgba(62, 224, 163, 0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, this.world.w - 2, this.world.h - 2);

      for (const obstacle of this.obstacles) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, TAU);
        ctx.fillStyle = `rgba(16, 36, 27, ${obstacle.shade})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(78, 132, 105, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(obstacle.x - obstacle.r * 0.24, obstacle.y - obstacle.r * 0.26, obstacle.r * 0.45, 0, TAU);
        ctx.fillStyle = 'rgba(93, 160, 127, 0.13)';
        ctx.fill();
        ctx.restore();
      }

      for (const crate of this.crates) {
        ctx.save();
        ctx.translate(crate.x, crate.y);
        ctx.rotate(crate.angle);
        if (crate.opened) {
          ctx.globalAlpha = 0.35;
        }
        ctx.fillStyle = '#5e4a17';
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.fillRect(-15, -15, 30, 30);
        ctx.strokeRect(-15, -15, 30, 30);
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.lineTo(15, 0);
        ctx.moveTo(0, -15);
        ctx.lineTo(0, 15);
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.65)';
        ctx.stroke();
        ctx.restore();
      }

      for (const pickup of this.pickups) {
        const bob = Math.sin(pickup.phase) * 3;
        ctx.save();
        ctx.translate(pickup.x, pickup.y + bob);
        const color = pickup.type === 'health' ? '#79f2a8' : pickup.type === 'shield' ? '#7cc8ff' : WEAPONS[pickup.weapon]?.color || '#ffd166';
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, pickup.r, 0, TAU);
        ctx.fillStyle = 'rgba(7, 19, 14, 0.9)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.font = '800 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pickup.type === 'health' ? '+' : pickup.type === 'shield' ? '◈' : '▸', 0, 0.5);
        ctx.restore();
      }

      for (const bullet of this.bullets) {
        const tail = 0.016;
        ctx.beginPath();
        ctx.moveTo(bullet.x, bullet.y);
        ctx.lineTo(bullet.x - bullet.vx * tail, bullet.y - bullet.vy * tail);
        ctx.strokeStyle = bullet.color;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = bullet.color;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      const drawUnit = (entity) => {
        if (!entity.alive) return;
        ctx.save();
        ctx.translate(entity.x, entity.y);
        ctx.shadowColor = entity.color;
        ctx.shadowBlur = entity.isPlayer ? 20 : 10;
        if (entity.isPlayer) {
          ctx.rotate(entity.angle);
          ctx.beginPath();
          ctx.moveTo(entity.r + 7, 0);
          ctx.lineTo(-entity.r * 0.8, entity.r * 0.78);
          ctx.lineTo(-entity.r * 0.4, 0);
          ctx.lineTo(-entity.r * 0.8, -entity.r * 0.78);
          ctx.closePath();
          ctx.fillStyle = entity.color;
          ctx.fill();
          ctx.strokeStyle = '#c9ffe7';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, entity.r, 0, TAU);
          ctx.fillStyle = entity.color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.rotate(entity.angle);
          ctx.beginPath();
          ctx.moveTo(entity.r - 2, 0);
          ctx.lineTo(entity.r + 9, 0);
          ctx.strokeStyle = '#f4fff9';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.restore();
        if (!entity.isPlayer && entity.hp < 100) {
          const width = 28;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(entity.x - width / 2, entity.y - entity.r - 13, width, 4);
          ctx.fillStyle = entity.color;
          ctx.fillRect(entity.x - width / 2, entity.y - entity.r - 13, width * clamp(entity.hp / 100, 0, 1), 4);
        }
      };

      for (const bot of this.bots) drawUnit(bot);
      drawUnit(this.player);

      for (const particle of this.particles) {
        ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (this.hudState().outside) {
        const pulse = 0.09 + Math.sin(this.time * 8) * 0.03;
        ctx.fillStyle = `rgba(255, 62, 98, ${pulse})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    screenToWorld(x, y) {
      return { x: this.camera.x + x, y: this.camera.y + y };
    }
  }

  class DuelGame extends MiniGameBase {
    constructor(canvas, options) {
      super(canvas, options);
      this.world = { w: 1200, h: 700 };
      this.transform = { scale: 1, ox: 0, oy: 0 };
      this.obstacles = [
        { x: 420, y: 190, r: 34 },
        { x: 780, y: 190, r: 34 },
        { x: 420, y: 510, r: 34 },
        { x: 780, y: 510, r: 34 },
        { x: 600, y: 350, r: 46 },
        { x: 600, y: 120, r: 26 },
        { x: 600, y: 580, r: 26 },
      ];
      this.bullets = [];
      this.particles = [];
      this.score = { player: 0, bot: 0 };
      this.round = 1;
      this.roundState = 'intro';
      this.introTimer = 1.35;
      this.roundEndTimer = 0;
      this.matchTimer = 45;
      this.lastRoundWinner = '';
      this.shake = 0;
      this.player = this.createPlayer();
      this.bot = this.createBot();
      this.emitHud(true);
    }

    createPlayer() {
      return {
        id: 0,
        isPlayer: true,
        name: this.t('Ty', 'You'),
        x: 230,
        y: 350,
        r: 15,
        hp: 100,
        shield: 30,
        angle: 0,
        weapon: 'smg',
        cooldown: 0,
        alive: true,
        color: '#3ee0a3',
        speed: 235,
        dashTime: 0,
        dashCd: 0,
      };
    }

    createBot() {
      return {
        id: 1,
        isPlayer: false,
        name: this.t('Bot', 'Bot'),
        x: 970,
        y: 350,
        r: 15,
        hp: 100,
        shield: 30,
        angle: Math.PI,
        weapon: 'smg',
        cooldown: 0.5,
        alive: true,
        color: '#ff7aa2',
        speed: 188,
        aimError: 0.13,
        think: 0,
        strafeDir: 1,
        seed: Math.random() * 100,
      };
    }

    resetRound() {
      this.player.x = 230;
      this.player.y = 350;
      this.player.hp = 100;
      this.player.shield = 30;
      this.player.alive = true;
      this.player.cooldown = 0;
      this.player.dashTime = 0;
      this.player.dashCd = 0;
      this.player.angle = 0;
      this.bot.x = 970;
      this.bot.y = 350;
      this.bot.hp = 100;
      this.bot.shield = 30;
      this.bot.alive = true;
      this.bot.cooldown = 0.5;
      this.bot.angle = Math.PI;
      this.bot.aimError = Math.max(0.055, 0.13 - (this.round - 1) * 0.025);
      this.bullets = [];
      this.particles = [];
      this.matchTimer = 45;
      this.roundState = 'intro';
      this.introTimer = 1.35;
      this.roundEndTimer = 0;
      this.shake = 0;
      this.emitHud(true);
    }

    hitsObstacle(x, y, radius) {
      return this.obstacles.some((item) => distance(x, y, item.x, item.y) < item.r + radius);
    }

    moveEntity(entity, dx, dy) {
      const nextX = clamp(entity.x + dx, entity.r, this.world.w - entity.r);
      if (!this.hitsObstacle(nextX, entity.y, entity.r)) entity.x = nextX;
      const nextY = clamp(entity.y + dy, entity.r, this.world.h - entity.r);
      if (!this.hitsObstacle(entity.x, nextY, entity.r)) entity.y = nextY;
    }

    spawnParticles(x, y, color, count, speed = 150) {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * TAU;
        const velocity = speed * (0.35 + Math.random() * 0.8);
        const life = 0.25 + Math.random() * 0.35;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life,
          maxLife: life,
          color,
          size: 1.5 + Math.random() * 2.4,
        });
      }
    }

    shoot(entity, angle) {
      const weapon = WEAPONS[entity.weapon] || WEAPONS.smg;
      entity.cooldown = weapon.fireRate;
      for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
        const shotAngle = angle + (Math.random() - 0.5) * weapon.spread * 2;
        const offset = entity.r + 7;
        this.bullets.push({
          x: entity.x + Math.cos(shotAngle) * offset,
          y: entity.y + Math.sin(shotAngle) * offset,
          vx: Math.cos(shotAngle) * weapon.speed,
          vy: Math.sin(shotAngle) * weapon.speed,
          damage: weapon.damage * (entity.isPlayer ? 1 : 0.9),
          ownerId: entity.id,
          color: weapon.color,
          life: 1,
        });
      }
      this.spawnParticles(entity.x + Math.cos(angle) * (entity.r + 8), entity.y + Math.sin(angle) * (entity.r + 8), weapon.color, 3, 90);
      if (entity.isPlayer) this.shake = Math.min(0.8, this.shake + 0.1);
    }

    damageEntity(entity, amount, ownerId) {
      if (!entity || !entity.alive || amount <= 0) return;
      const absorbed = Math.min(entity.shield, amount);
      entity.shield -= absorbed;
      entity.hp -= amount - absorbed;
      if (entity.hp <= 0) {
        entity.hp = 0;
        entity.alive = false;
        this.spawnParticles(entity.x, entity.y, entity.color, 20, 200);
        if (entity.isPlayer) this.shake = 1;
        if (this.roundState === 'playing') this.endRound(ownerId === 0 ? 'player' : 'bot');
      }
    }

    hasLineOfSight(x1, y1, x2, y2) {
      return !this.obstacles.some((item) => segmentHitsCircle(x1, y1, x2, y2, item.x, item.y, item.r + 2));
    }

    updatePlayer(dt) {
      const player = this.player;
      player.cooldown = Math.max(0, player.cooldown - dt);
      player.dashCd = Math.max(0, player.dashCd - dt);
      player.dashTime = Math.max(0, player.dashTime - dt);
      if (!player.alive || this.roundState !== 'playing') return;
      let dx = 0;
      let dy = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
      const length = Math.hypot(dx, dy);
      if ((this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && player.dashCd <= 0 && length > 0) {
        player.dashTime = 0.16;
        player.dashCd = 2.2;
        this.spawnParticles(player.x, player.y, '#9ef7cf', 10, 160);
      }
      const dash = player.dashTime > 0;
      const speed = dash ? 760 : player.speed;
      if (length > 0) {
        this.moveEntity(player, (dx / length) * speed * dt, (dy / length) * speed * dt);
        if (dash && Math.random() < 0.45) this.spawnParticles(player.x, player.y, '#3ee0a3', 1, 40);
      }
      if (this.mouse.seen) {
        player.angle = Math.atan2(this.mouse.y - player.y, this.mouse.x - player.x);
      }
      if (this.mouse.down && player.cooldown <= 0) this.shoot(player, player.angle);
    }

    updateBot(dt) {
      const bot = this.bot;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      if (!bot.alive || this.roundState !== 'playing') return;
      const dx = this.player.x - bot.x;
      const dy = this.player.y - bot.y;
      const dist = Math.hypot(dx, dy) || 1;
      const aim = Math.atan2(dy, dx);
      bot.angle = aim + Math.sin(this.time * 4 + bot.seed) * bot.aimError;
      const visible = this.hasLineOfSight(bot.x, bot.y, this.player.x, this.player.y);
      if (visible && bot.cooldown <= 0 && dist < 720) this.shoot(bot, bot.angle);
      let forward = 0;
      if (dist > 390) forward = 1;
      else if (dist < 190) forward = -1;
      if (!visible) forward = 1;
      const strafe = bot.strafeDir;
      const moveX = (dx / dist) * forward + (-dy / dist) * strafe * 0.78;
      const moveY = (dy / dist) * forward + (dx / dist) * strafe * 0.78;
      const moveLength = Math.hypot(moveX, moveY) || 1;
      if (forward !== 0 || visible) {
        this.moveEntity(bot, (moveX / moveLength) * bot.speed * dt, (moveY / moveLength) * bot.speed * dt);
      }
      if (Math.random() < dt * 0.6) bot.strafeDir *= -1;
    }

    updateBullets(dt) {
      const entities = [this.player, this.bot];
      for (const bullet of this.bullets) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.life -= dt;
        if (bullet.life <= 0 || bullet.x < 0 || bullet.y < 0 || bullet.x > this.world.w || bullet.y > this.world.h) {
          bullet.dead = true;
          continue;
        }
        if (this.hitsObstacle(bullet.x, bullet.y, 2)) {
          bullet.dead = true;
          this.spawnParticles(bullet.x, bullet.y, bullet.color, 2, 70);
          continue;
        }
        for (const entity of entities) {
          if (!entity.alive || entity.id === bullet.ownerId) continue;
          if (distance(bullet.x, bullet.y, entity.x, entity.y) <= entity.r + 3) {
            this.damageEntity(entity, bullet.damage, bullet.ownerId);
            this.spawnParticles(bullet.x, bullet.y, bullet.color, 4, 100);
            bullet.dead = true;
            break;
          }
        }
      }
      if (this.bullets.some((bullet) => bullet.dead)) {
        this.bullets = this.bullets.filter((bullet) => !bullet.dead);
      }
    }

    updateParticles(dt) {
      for (const particle of this.particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.96;
        particle.vy *= 0.96;
        particle.life -= dt;
      }
      if (this.particles.some((particle) => particle.life <= 0)) {
        this.particles = this.particles.filter((particle) => particle.life > 0);
      }
    }

    endRound(winner) {
      if (this.roundState !== 'playing') return;
      this.roundState = 'roundEnd';
      this.roundEndTimer = 1.65;
      this.lastRoundWinner = winner;
      if (winner === 'player') this.score.player += 1;
      if (winner === 'bot') this.score.bot += 1;
      this.emitHud(true);
    }

    finishMatch() {
      this.roundState = 'over';
      this.finish({
        mode: 'duel',
        winner: this.score.player > this.score.bot ? 'player' : 'bot',
        playerScore: this.score.player,
        botScore: this.score.bot,
        rounds: this.round,
      });
    }

    update(dt) {
      if (this.ended) return;
      this.updateParticles(dt);
      this.shake = Math.max(0, this.shake - dt * 4);
      if (this.roundState === 'intro') {
        this.introTimer -= dt;
        if (this.introTimer <= 0) {
          this.roundState = 'playing';
          this.emitHud(true);
        }
        return;
      }
      if (this.roundState === 'roundEnd') {
        this.roundEndTimer -= dt;
        if (this.roundEndTimer <= 0) {
          if (this.score.player >= 2 || this.score.bot >= 2) {
            this.finishMatch();
          } else {
            this.round += 1;
            this.resetRound();
          }
        }
        return;
      }
      if (this.roundState !== 'playing') return;

      this.matchTimer = Math.max(0, this.matchTimer - dt);
      this.updatePlayer(dt);
      this.updateBot(dt);
      this.updateBullets(dt);

      if (this.roundState !== 'playing') return;
      if (this.matchTimer <= 0) {
        if (this.player.hp === this.bot.hp) this.endRound('draw');
        else this.endRound(this.player.hp > this.bot.hp ? 'player' : 'bot');
      }
    }

    hudState() {
      return {
        mode: 'duel',
        playerName: this.t('Ty', 'You'),
        opponentName: this.t('Bot', 'Bot'),
        hp: Math.max(0, Math.ceil(this.player.hp)),
        shield: Math.max(0, Math.ceil(this.player.shield)),
        scorePlayer: this.score.player,
        scoreBot: this.score.bot,
        round: this.round,
        timer: Math.max(0, Math.ceil(this.matchTimer)),
        roundState: this.roundState,
        dash: this.player.dashCd <= 0 ? 100 : Math.round((1 - this.player.dashCd / 2.2) * 100),
        weapon: this.weaponName(this.player.weapon),
      };
    }

    updateTransform() {
      const { w, h } = this.view;
      const scale = Math.min(w / this.world.w, h / this.world.h) * 0.94;
      this.transform = {
        scale,
        ox: (w - this.world.w * scale) / 2,
        oy: (h - this.world.h * scale) / 2,
      };
    }

    screenToWorld(x, y) {
      const { scale, ox, oy } = this.transform;
      return { x: (x - ox) / scale, y: (y - oy) / scale };
    }

    draw() {
      const ctx = this.ctx;
      const { w, h } = this.view;
      if (w < 2 || h < 2) return;
      this.updateTransform();
      const { scale, ox, oy } = this.transform;

      ctx.clearRect(0, 0, w, h);
      const backdrop = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.75);
      backdrop.addColorStop(0, '#0c1a16');
      backdrop.addColorStop(1, '#040906');
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, w, h);

      const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 8 : 0;
      const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 8 : 0;
      ctx.save();
      ctx.translate(ox + shakeX, oy + shakeY);
      ctx.scale(scale, scale);

      const floor = ctx.createLinearGradient(0, 0, this.world.w, this.world.h);
      floor.addColorStop(0, '#081812');
      floor.addColorStop(0.5, '#0a1f18');
      floor.addColorStop(1, '#101124');
      ctx.fillStyle = floor;
      ctx.fillRect(0, 0, this.world.w, this.world.h);

      ctx.strokeStyle = 'rgba(62, 224, 163, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= this.world.w; x += 60) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.world.h);
      }
      for (let y = 0; y <= this.world.h; y += 60) {
        ctx.moveTo(0, y);
        ctx.lineTo(this.world.w, y);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 122, 162, 0.16)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.moveTo(this.world.w / 2, 26);
      ctx.lineTo(this.world.w / 2, this.world.h - 26);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(62, 224, 163, 0.3)';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, this.world.w - 8, this.world.h - 8);

      for (const obstacle of this.obstacles) {
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, TAU);
        ctx.fillStyle = 'rgba(19, 43, 33, 0.96)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(86, 143, 113, 0.65)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(obstacle.x - obstacle.r * 0.22, obstacle.y - obstacle.r * 0.25, obstacle.r * 0.42, 0, TAU);
        ctx.fillStyle = 'rgba(104, 177, 140, 0.12)';
        ctx.fill();
      }

      for (const bullet of this.bullets) {
        ctx.beginPath();
        ctx.moveTo(bullet.x, bullet.y);
        ctx.lineTo(bullet.x - bullet.vx * 0.018, bullet.y - bullet.vy * 0.018);
        ctx.strokeStyle = bullet.color;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = bullet.color;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      const drawUnit = (entity, label) => {
        if (!entity.alive) return;
        ctx.save();
        ctx.translate(entity.x, entity.y);
        ctx.shadowColor = entity.color;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(0, 0, entity.r, 0, TAU);
        ctx.fillStyle = entity.color;
        ctx.fill();
        ctx.strokeStyle = '#eafff6';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.rotate(entity.angle);
        ctx.beginPath();
        ctx.moveTo(entity.r - 3, 0);
        ctx.lineTo(entity.r + 13, 0);
        ctx.strokeStyle = '#f7fffb';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(entity.x - 34, entity.y - entity.r - 23, 68, 15);
        ctx.fillStyle = entity.color;
        ctx.font = '800 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, entity.x, entity.y - entity.r - 15.5);
        if (entity.shield > 0) {
          ctx.beginPath();
          ctx.arc(entity.x, entity.y, entity.r + 6, 0, TAU);
          ctx.strokeStyle = 'rgba(124, 200, 255, 0.8)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      };
      drawUnit(this.bot, this.t('BOT', 'BOT'));
      drawUnit(this.player, this.t('TY', 'YOU'));

      for (const particle of this.particles) {
        ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (this.roundState === 'intro') {
        ctx.fillStyle = 'rgba(4, 9, 6, 0.55)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f4fff9';
        ctx.font = '850 44px system-ui, sans-serif';
        ctx.fillText(this.t(`RUNDA ${this.round}`, `ROUND ${this.round}`), w / 2, h / 2 - 18);
        ctx.fillStyle = 'rgba(158, 247, 207, 0.8)';
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.fillText(this.t('Gotowy?', 'Ready?'), w / 2, h / 2 + 32);
      } else if (this.roundState === 'roundEnd') {
        ctx.fillStyle = 'rgba(4, 9, 6, 0.45)';
        ctx.fillRect(0, 0, w, h);
        const label = this.lastRoundWinner === 'player'
          ? this.t('Runda dla Ciebie', 'Round won')
          : this.lastRoundWinner === 'bot'
            ? this.t('Runda dla bota', 'Round lost')
            : this.t('Remis', 'Draw');
        ctx.fillStyle = this.lastRoundWinner === 'player' ? '#9ef7cf' : this.lastRoundWinner === 'bot' ? '#ff9fb9' : '#f4d35e';
        ctx.font = '850 40px system-ui, sans-serif';
        ctx.fillText(label, w / 2, h / 2);
      }
    }
  }

  function createGame(gameId, canvas, options = {}) {
    if (!CATALOG_BY_ID.has(gameId)) throw new Error(`Unknown mini game: ${gameId}`);
    if (!canvas || typeof canvas.getContext !== 'function') throw new Error('A canvas element is required');
    if (gameId === 'duel') return new DuelGame(canvas, options);
    return new BattleGame(canvas, options);
  }

  const api = Object.freeze({
    version: 1,
    catalog: CATALOG,
    weapons: WEAPONS,
    gameIds: Object.freeze(CATALOG.map((game) => game.id)),
    normalizeInstalled,
    stormRadius,
    createGame,
  });

  root.CHILL_MINIGAMES = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
