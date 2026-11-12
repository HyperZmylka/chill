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
      taglinePl: '12 graczy. Trójwymiarowa arena. Kurcząca się strefa i tylko jedno zwycięskie miejsce.',
      taglineEn: '12 players. A three-dimensional arena. A shrinking storm and room for one winner.',
      descriptionPl: 'Wskocz na trójwymiarową wyspę, rozbijaj skrzynie, zbieraj broń i przetrwaj kurczącą się strefę. Własna, lekka battle royale z widokiem zza pleców — bez ogromnego klienta.',
      descriptionEn: 'Drop onto a three-dimensional island, crack chests, grab weapons and outlast the shrinking storm. Your own lightweight third-person battle royale — no huge client required.',
      tagsPl: ['Battle Royale', '3D', '12 graczy', 'Boty'],
      tagsEn: ['Battle Royale', '3D', '12 players', 'Bots'],
      controlsPl: 'WASD — ruch • Mysz — kamera/celowanie • LPM — strzał • Spacja — skok • Shift — sprint • E — skrzynia • R — przeładuj',
      controlsEn: 'WASD — move • Mouse — camera/aim • LMB — shoot • Space — jump • Shift — sprint • E — chest • R — reload',
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
    pistol: Object.freeze({ id: 'pistol', namePl: 'Pistolet', nameEn: 'Pistol', damage: 18, fireRate: 0.28, speed: 980, spread: 0.025, pellets: 1, color: '#9ef7cf', range: 110, mag: 12, reserve: 48, reload: 1.05, auto: false, recoil: 0.014 }),
    smg: Object.freeze({ id: 'smg', namePl: 'SMG', nameEn: 'SMG', damage: 10, fireRate: 0.085, speed: 1050, spread: 0.075, pellets: 1, color: '#7cc8ff', range: 80, mag: 30, reserve: 90, reload: 1.5, auto: true, recoil: 0.009 }),
    shotgun: Object.freeze({ id: 'shotgun', namePl: 'Strzelba', nameEn: 'Shotgun', damage: 8, fireRate: 0.75, speed: 840, spread: 0.2, pellets: 6, color: '#ffd166', range: 34, mag: 6, reserve: 24, reload: 1.85, auto: false, recoil: 0.045 }),
    rifle: Object.freeze({ id: 'rifle', namePl: 'Karabin', nameEn: 'Rifle', damage: 25, fireRate: 0.22, speed: 1320, spread: 0.012, pellets: 1, color: '#ff9f7a', range: 180, mag: 20, reserve: 60, reload: 1.65, auto: true, recoil: 0.025 }),
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

  const BATTLE = Object.freeze({
    arenaRadius: 220,
    stormStart: 205,
    stormMin: 24,
    stormHold: 16,
    stormDuration: 96,
    stormDamage: 7,
    eyeHeight: 1.48,
    shoulder: 0.78,
    playerRadius: 0.55,
    cameraDistance: 5.4,
    cameraNear: 0.09,
    fov: (70 * Math.PI) / 180,
    mouseSensitivity: 0.0024,
    gravity: 23,
    jumpSpeed: 7.2,
    walkSpeed: 6.1,
    sprintSpeed: 9.5,
    botCount: 11,
    shieldMax: 60,
    healthMax: 100,
  });
  const LIGHT_DIR = Object.freeze({ x: -0.42, y: 0.79, z: -0.44 });
  const FOG_RGB = Object.freeze([72, 112, 98]);
  const BOT_COLORS = Object.freeze(['#ff7a7a', '#ffb86b', '#c7a1ff', '#67d8ff', '#ff8ac9', '#97e36f', '#f4d35e', '#9aa7ff', '#ff9f7a', '#7ce7d2', '#d3a4ff']);
  const BOT_WEAPONS = Object.freeze(['pistol', 'smg', 'smg', 'rifle', 'pistol', 'shotgun', 'smg', 'rifle', 'pistol', 'shotgun', 'smg']);
  const BOT_NAMES_PL = Object.freeze(['Iskra', 'Fala', 'Kropka', 'Mgła', 'Bursztyn', 'Sosna', 'Kompres', 'Żagiel', 'Kamyk', 'Nurt', 'Lisek']);
  const BOT_NAMES_EN = Object.freeze(['Spark', 'Wave', 'Dot', 'Mist', 'Amber', 'Pine', 'Frost', 'Sail', 'Pebble', 'Current', 'Fox']);

  const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
  const addV = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const subV = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const scaleV = (v, factor) => ({ x: v.x * factor, y: v.y * factor, z: v.z * factor });
  const dotV = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const crossV = (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const lengthV = (v) => Math.hypot(v.x, v.y, v.z);
  const normalizeV = (v) => {
    const length = lengthV(v);
    return length > 1e-9 ? { x: v.x / length, y: v.y / length, z: v.z / length } : { x: 0, y: 0, z: 0 };
  };

  function normalizeAngle(angle) {
    let value = Number(angle) || 0;
    while (value > Math.PI) value -= TAU;
    while (value < -Math.PI) value += TAU;
    return value;
  }

  function makeCameraBasis(position, target) {
    const forward = normalizeV(subV(target, position));
    const worldUp = vec3(0, 1, 0);
    let right = normalizeV(crossV(worldUp, forward));
    if (lengthV(right) < 1e-6) right = vec3(1, 0, 0);
    const up = normalizeV(crossV(forward, right));
    return { position: { ...position }, forward, right, up };
  }

  function toCameraSpace(point, basis) {
    const rel = subV(point, basis.position);
    return {
      x: dotV(rel, basis.right),
      y: dotV(rel, basis.up),
      z: dotV(rel, basis.forward),
    };
  }

  function projectCameraSpace(space, focal, width, height, near = BATTLE.cameraNear) {
    if (!space || space.z <= near) return { visible: false, x: 0, y: 0, depth: space ? space.z : 0, scale: 0 };
    const scale = focal / space.z;
    return {
      visible: true,
      x: width / 2 + space.x * scale,
      y: height / 2 - space.y * scale,
      depth: space.z,
      scale,
    };
  }

  function projectPoint(point, basis, focal, width, height, near = BATTLE.cameraNear) {
    return projectCameraSpace(toCameraSpace(point, basis), focal, width, height, near);
  }

  function projectSegment(a, b, basis, focal, width, height, near = BATTLE.cameraNear) {
    let ca = toCameraSpace(a, basis);
    let cb = toCameraSpace(b, basis);
    if (ca.z <= near && cb.z <= near) return null;
    if (ca.z <= near) {
      const t = (near - ca.z) / (cb.z - ca.z);
      ca = { x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t, z: near };
    } else if (cb.z <= near) {
      const t = (near - cb.z) / (ca.z - cb.z);
      cb = { x: cb.x + (ca.x - cb.x) * t, y: cb.y + (ca.y - cb.y) * t, z: near };
    }
    const pa = projectCameraSpace(ca, focal, width, height, near);
    const pb = projectCameraSpace(cb, focal, width, height, near);
    if (!pa.visible || !pb.visible) return null;
    return { ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, depth: Math.max(ca.z, cb.z) };
  }

  function raySphereHit(origin, direction, center, radius, maxDistance = Infinity) {
    const dir = normalizeV(direction);
    const ox = origin.x - center.x;
    const oy = origin.y - center.y;
    const oz = origin.z - center.z;
    const b = 2 * (ox * dir.x + oy * dir.y + oz * dir.z);
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const discriminant = b * b - 4 * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const t1 = (-b - root) / 2;
    const t2 = (-b + root) / 2;
    const t = t1 >= 0 ? t1 : t2;
    if (t < 0 || t > maxDistance) return null;
    return { distance: t, point: addV(origin, scaleV(dir, t)) };
  }

  function rayCylinderHit(origin, direction, center, radius, height, maxDistance = Infinity) {
    const dir = normalizeV(direction);
    const ox = origin.x - center.x;
    const oz = origin.z - center.z;
    const a = dir.x * dir.x + dir.z * dir.z;
    let t = null;
    if (a > 1e-9) {
      const b = 2 * (ox * dir.x + oz * dir.z);
      const c = ox * ox + oz * oz - radius * radius;
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)];
        for (const candidate of candidates) {
          if (candidate < 0 || candidate > maxDistance) continue;
          const y = origin.y + dir.y * candidate;
          if (y >= center.y && y <= center.y + height) {
            t = candidate;
            break;
          }
        }
      }
    }
    if (t === null) return null;
    return { distance: t, point: addV(origin, scaleV(dir, t)) };
  }

  function rayAABBHit(origin, direction, min, max, maxDistance = Infinity) {
    const dir = normalizeV(direction);
    let tMin = 0;
    let tMax = maxDistance;
    for (const axis of ['x', 'y', 'z']) {
      const d = dir[axis];
      if (Math.abs(d) < 1e-9) {
        if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
        continue;
      }
      let t1 = (min[axis] - origin[axis]) / d;
      let t2 = (max[axis] - origin[axis]) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }
    if (tMin < 0) tMin = 0;
    return { distance: tMin, point: addV(origin, scaleV(dir, tMin)) };
  }

  function rayBoxHit(origin, direction, box, maxDistance = Infinity) {
    const halfW = box.w / 2;
    const halfD = box.d / 2;
    const baseY = box.baseY || 0;
    return rayAABBHit(
      origin,
      direction,
      { x: box.x - halfW, y: baseY, z: box.z - halfD },
      { x: box.x + halfW, y: baseY + box.h, z: box.z + halfD },
      maxDistance,
    );
  }

  function hexToRgb(hex) {
    const value = String(hex || '').replace('#', '');
    if (value.length !== 6) return { r: 62, g: 224, b: 163 };
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  function shadeColor(hex, factor, fogAmount = 0, fog = FOG_RGB) {
    const { r, g, b } = hexToRgb(hex);
    const fogMix = clamp(fogAmount, 0, 1);
    const out = [r * factor, g * factor, b * factor].map((value, index) => {
      const mixed = value + (fog[index] - value) * fogMix;
      return Math.round(clamp(mixed, 0, 255));
    });
    return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
  }

  function circleBoxHit(x, z, radius, box, padding = 0) {
    const halfW = box.w / 2 + padding;
    const halfD = box.d / 2 + padding;
    const dx = clamp(x - box.x, -halfW, halfW);
    const dz = clamp(z - box.z, -halfD, halfD);
    return distance(x, z, box.x + dx, box.z + dz) < radius;
  }

  function clipPolygonNear(points, near) {
    const output = [];
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      const currentInside = current.z > near;
      const nextInside = next.z > near;
      if (currentInside) output.push(current);
      if (currentInside !== nextInside) {
        const t = (near - current.z) / (next.z - current.z);
        output.push({
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
          z: near,
        });
      }
    }
    return output;
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
      this.arena = { radius: BATTLE.arenaRadius };
      this.spawnPoint = { x: 0, z: 172 };
      this.storm = {
        start: BATTLE.stormStart,
        min: BATTLE.stormMin,
        hold: BATTLE.stormHold,
        duration: BATTLE.stormDuration,
        elapsed: 0,
      };
      this.buildings = [];
      this.covers = [];
      this.trees = [];
      this.rocks = [];
      this.chests = [];
      this.pickups = [];
      this.particles = [];
      this.tracers = [];
      this.floaters = [];
      this.killFeed = [];
      this.camera = {
        yaw: Math.PI,
        pitch: -0.04,
        kick: 0,
        shake: 0,
        distance: BATTLE.cameraDistance,
        basis: null,
        locked: false,
        dragging: false,
      };
      this.hitMarker = 0;
      this.damageFlash = 0;
      this.pendingEnd = null;
      this.clock = 0;
      this.stats = { shots: 0, hits: 0, damage: 0 };
      this.createWorld();
      this.player = this.createPlayer();
      this.bots = this.createBots(BATTLE.botCount);
      this.bindBattleEvents();
      this.emitHud(true);
    }

    focal() {
      return (this.view.h / 2) / Math.tan(BATTLE.fov / 2);
    }

    rightVector(yaw = this.camera.yaw) {
      return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    }

    forwardVector() {
      const pitch = clamp(this.camera.pitch + this.camera.kick, -0.95, 0.95);
      return {
        x: Math.sin(this.camera.yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: Math.cos(this.camera.yaw) * Math.cos(pitch),
      };
    }

    randomSpot(minRadius, maxRadius, clearance = 1.2, avoid = []) {
      for (let attempt = 0; attempt < 320; attempt += 1) {
        const angle = Math.random() * TAU;
        const radius = minRadius + Math.random() * Math.max(0.001, maxRadius - minRadius);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (distance(x, z, this.spawnPoint.x, this.spawnPoint.z) < 12) continue;
        if (avoid.some((item) => distance(x, z, item.x, item.z) < (item.r || 0) + clearance)) continue;
        if (this.buildings.some((box) => circleBoxHit(x, z, clearance, box, 0))) continue;
        if (this.covers.some((box) => circleBoxHit(x, z, clearance, box, 0))) continue;
        if (this.trees.some((tree) => distance(x, z, tree.x, tree.z) < tree.radius + clearance + 1.1)) continue;
        if (this.rocks.some((rock) => distance(x, z, rock.x, rock.z) < rock.radius + clearance)) continue;
        if (this.chests.some((chest) => distance(x, z, chest.x, chest.z) < clearance + 1.4)) continue;
        return { x, z };
      }
      return { x: Math.cos(Math.random() * TAU) * minRadius, z: Math.sin(Math.random() * TAU) * minRadius };
    }

    createWorld() {
      const palette = ['#e8c27c', '#d98f6b', '#8dc6b0', '#f0d8a5', '#b9a8dd', '#7fb3d9'];
      const roofs = ['#7d4f3c', '#8a4e4e', '#2f6b58', '#5b4a75', '#8a6a3f', '#3d5d80'];
      for (let index = 0; index < 20; index += 1) {
        const spot = this.randomSpot(26, 188, 3.4);
        const w = 5 + Math.random() * 6;
        const d = 5 + Math.random() * 6;
        const h = 2.8 + Math.random() * 4.6;
        this.buildings.push({
          x: spot.x,
          z: spot.z,
          w,
          d,
          h,
          color: palette[index % palette.length],
          roof: roofs[index % roofs.length],
          trim: index % 5 === 0 ? '#ffdf9e' : index % 7 === 0 ? '#a9e6ff' : '#fff1cf',
        });
      }
      for (let index = 0; index < 12; index += 1) {
        const spot = this.randomSpot(20, 198, 2.1);
        this.covers.push({
          x: spot.x,
          z: spot.z,
          w: 2.5 + Math.random() * 3.2,
          d: 1.1 + Math.random() * 1.5,
          h: 1 + Math.random() * 0.55,
          color: index % 3 === 0 ? '#b27a4a' : index % 3 === 1 ? '#4a7aa8' : '#9a5a6a',
        });
      }
      for (let index = 0; index < 30; index += 1) {
        const spot = this.randomSpot(16, 202, 1.4);
        const scale = 0.8 + Math.random() * 0.8;
        this.trees.push({
          x: spot.x,
          z: spot.z,
          scale,
          radius: 0.36 * scale,
          trunkHeight: 2.1 * scale,
          canopyRadius: 1.55 * scale,
          canopyHeight: 2.8 * scale,
          shade: 0.82 + Math.random() * 0.3,
        });
      }
      for (let index = 0; index < 18; index += 1) {
        const spot = this.randomSpot(16, 205, 1.2);
        this.rocks.push({
          x: spot.x,
          z: spot.z,
          radius: 0.6 + Math.random() * 0.95,
          height: 0.55 + Math.random() * 0.8,
          yaw: Math.random() * TAU,
          color: index % 3 === 0 ? '#9aa39d' : '#7f8a84',
        });
      }
      this.chests.push({
        x: this.spawnPoint.x + 3.4,
        z: this.spawnPoint.z - 7.5,
        opened: false,
        phase: 0,
        yaw: 0.6,
      });
      for (let index = 0; index < 15; index += 1) {
        const spot = this.randomSpot(14, 196, 1.5);
        this.chests.push({
          x: spot.x,
          z: spot.z,
          opened: false,
          phase: Math.random() * TAU,
          yaw: Math.random() * TAU,
        });
      }
    }

    createPlayer() {
      const weapon = WEAPONS.pistol;
      return {
        id: 0,
        isPlayer: true,
        name: this.t('Ty', 'You'),
        x: this.spawnPoint.x,
        y: 0,
        z: this.spawnPoint.z,
        vy: 0,
        grounded: true,
        radius: BATTLE.playerRadius,
        height: 1.8,
        hp: BATTLE.healthMax,
        shield: 0,
        alive: true,
        kills: 0,
        color: '#3ee0a3',
        weapon: 'pistol',
        mag: weapon.mag,
        reserve: weapon.reserve,
        cooldown: 0,
        reloadTimer: 0,
        spreadVisual: 0,
        moveAmount: 0,
        yaw: this.camera.yaw,
      };
    }

    createBots(count) {
      const bots = [];
      for (let index = 0; index < count; index += 1) {
        let spot = null;
        for (let attempt = 0; attempt < 180; attempt += 1) {
          const candidate = this.randomSpot(24, 190, 1.3);
          if (distance(candidate.x, candidate.z, this.spawnPoint.x, this.spawnPoint.z) < 28) continue;
          if (bots.some((bot) => distance(candidate.x, candidate.z, bot.x, bot.z) < 9)) continue;
          spot = candidate;
          break;
        }
        if (!spot) spot = this.randomSpot(24, 190, 1.3);
        const weaponId = BOT_WEAPONS[index % BOT_WEAPONS.length];
        const weapon = WEAPONS[weaponId] || WEAPONS.pistol;
        bots.push({
          id: index + 1,
          isPlayer: false,
          name: this.t(BOT_NAMES_PL[index % BOT_NAMES_PL.length], BOT_NAMES_EN[index % BOT_NAMES_EN.length]),
          x: spot.x,
          y: 0,
          z: spot.z,
          vy: 0,
          grounded: true,
          radius: 0.5,
          height: 1.75,
          hp: BATTLE.healthMax,
          shield: index % 4 === 0 ? 30 : 0,
          alive: true,
          kills: 0,
          color: BOT_COLORS[index % BOT_COLORS.length],
          weapon: weaponId,
          mag: weapon.mag,
          reserve: weapon.reserve,
          cooldown: 0.7 + Math.random() * 1.1,
          reloadTimer: 0,
          yaw: Math.random() * TAU,
          speed: 4.2 + Math.random() * 1.5,
          aimError: 0.03 + Math.random() * 0.055,
          think: Math.random() * 0.5,
          targetId: null,
          strafeDir: Math.random() < 0.5 ? -1 : 1,
          wanderAngle: Math.random() * TAU,
          seed: Math.random() * 100,
          moveAmount: 0,
        });
      }
      return bots;
    }

    entities() {
      const list = this.bots.filter((bot) => bot.alive);
      if (this.player.alive) list.unshift(this.player);
      return list;
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

    stormLabel() {
      if (this.storm.elapsed < this.storm.hold) {
        return this.t(
          `Strefa za ${Math.ceil(this.storm.hold - this.storm.elapsed)} s`,
          `Storm in ${Math.ceil(this.storm.hold - this.storm.elapsed)}s`,
        );
      }
      if (this.currentStormRadius() <= this.storm.min + 1) return this.t('Strefa minimalna', 'Final storm');
      return this.t('Strefa się kurczy', 'Storm shrinking');
    }

    collidesAt(x, z, radius, feetY = 0) {
      if (Math.hypot(x, z) > this.arena.radius - radius) return true;
      if (this.buildings.some((box) => circleBoxHit(x, z, radius, box))) return true;
      if (this.covers.some((box) => feetY < box.h - 0.16 && circleBoxHit(x, z, radius, box))) return true;
      if (this.trees.some((tree) => distance(x, z, tree.x, tree.z) < tree.radius + radius)) return true;
      if (this.rocks.some((rock) => feetY < rock.height - 0.1 && distance(x, z, rock.x, rock.z) < rock.radius + radius)) return true;
      return false;
    }

    moveEntity(entity, dx, dz) {
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.32));
      const stepX = dx / steps;
      const stepZ = dz / steps;
      for (let step = 0; step < steps; step += 1) {
        const nextX = entity.x + stepX;
        if (!this.collidesAt(nextX, entity.z, entity.radius, entity.y)) entity.x = nextX;
        const nextZ = entity.z + stepZ;
        if (!this.collidesAt(entity.x, nextZ, entity.radius, entity.y)) entity.z = nextZ;
      }
    }

    pointBlocked(x, y, z, radius) {
      if (this.buildings.some((box) => y < box.h + 0.25 && circleBoxHit(x, z, radius, box))) return true;
      if (this.covers.some((box) => y < box.h + 0.25 && circleBoxHit(x, z, radius, box))) return true;
      if (this.trees.some((tree) => y < tree.trunkHeight + 0.4 && distance(x, z, tree.x, tree.z) < tree.radius + radius)) return true;
      if (this.rocks.some((rock) => y < rock.height + 0.25 && distance(x, z, rock.x, rock.z) < rock.radius + radius)) return true;
      return false;
    }

    raycastWorld(origin, direction, maxDistance = 240) {
      const dir = normalizeV(direction);
      let best = null;
      const consider = (hit, kind) => {
        if (!hit || hit.distance < 0 || hit.distance > maxDistance) return;
        if (!best || hit.distance < best.distance) {
          best = { distance: hit.distance, point: hit.point, kind };
        }
      };
      if (dir.y < -1e-5) {
        const groundDistance = -origin.y / dir.y;
        if (groundDistance >= 0 && groundDistance <= maxDistance) {
          consider({ distance: groundDistance, point: addV(origin, scaleV(dir, groundDistance)) }, 'ground');
        }
      }
      for (const box of this.buildings) consider(rayBoxHit(origin, dir, box, maxDistance), 'building');
      for (const box of this.covers) consider(rayBoxHit(origin, dir, box, maxDistance), 'cover');
      for (const tree of this.trees) {
        consider(rayCylinderHit(origin, dir, { x: tree.x, y: 0, z: tree.z }, tree.radius, tree.trunkHeight, maxDistance), 'tree');
        consider(raySphereHit(
          origin,
          dir,
          { x: tree.x, y: tree.trunkHeight + tree.canopyHeight * 0.52, z: tree.z },
          tree.canopyRadius * 0.92,
          maxDistance,
        ), 'tree');
      }
      for (const rock of this.rocks) {
        consider(rayCylinderHit(origin, dir, { x: rock.x, y: 0, z: rock.z }, rock.radius, rock.height, maxDistance), 'rock');
      }
      for (const chest of this.chests) {
        consider(rayBoxHit(origin, dir, { x: chest.x, z: chest.z, w: 1.2, d: 0.9, h: 0.95 }, maxDistance), 'chest');
      }
      return best;
    }

    lineOfSight(from, to) {
      const delta = subV(to, from);
      const dist = lengthV(delta);
      if (dist < 0.4) return true;
      const dir = normalizeV(delta);
      const origin = addV(from, scaleV(dir, 0.35));
      return !this.raycastWorld(origin, dir, Math.max(0.1, dist - 0.35));
    }

    updateCamera(dt) {
      this.camera.kick = Math.max(0, this.camera.kick - dt * 1.7);
      this.camera.shake = Math.max(0, this.camera.shake - dt * 3.1);
      const player = this.player;
      const right = this.rightVector();
      const bob = player.alive && player.grounded && player.moveAmount > 0.12
        ? Math.sin(this.clock * 10.5) * 0.035
        : 0;
      const target = {
        x: player.x + right.x * BATTLE.shoulder,
        y: player.y + BATTLE.eyeHeight + bob,
        z: player.z + right.z * BATTLE.shoulder,
      };
      const forward = this.forwardVector();
      const desired = {
        x: target.x - forward.x * this.camera.distance,
        y: Math.max(0.42, target.y - forward.y * this.camera.distance),
        z: target.z - forward.z * this.camera.distance,
      };
      const offset = subV(desired, target);
      const total = lengthV(offset);
      const dir = normalizeV(offset);
      let limit = total;
      for (let step = 0.5; step <= total; step += 0.3) {
        if (this.pointBlocked(target.x + dir.x * step, target.y + dir.y * step, target.z + dir.z * step, 0.26)) {
          limit = Math.max(0.75, step - 0.3);
          break;
        }
      }
      const position = addV(target, scaleV(dir, limit));
      position.y = Math.max(0.42, position.y);
      this.camera.basis = makeCameraBasis(position, target);
    }

    screenToWorld(x, y) {
      return { x, y };
    }

    bindBattleEvents() {
      this.suppressShotUntil = 0;
      this.handleBattleKeyDown = (event) => {
        if (this.destroyed || event.repeat) return;
        if (!this.running || this.paused || this.ended) return;
        if (event.code === 'Space') {
          event.preventDefault();
          this.jump();
        } else if (event.code === 'KeyR') {
          this.reload();
        } else if (event.code === 'KeyE') {
          this.interact();
        }
      };
      this.handleBattleLook = (event) => {
        if (this.destroyed || !this.running || this.paused) return;
        const locked = document.pointerLockElement === this.canvas;
        if (locked) {
          this.applyLook(Number(event.movementX) || 0, Number(event.movementY) || 0);
          return;
        }
        if (!this.camera.dragging) return;
        const last = this.camera.dragLast || { x: event.clientX, y: event.clientY };
        const dx = (Number(event.clientX) || 0) - last.x;
        const dy = (Number(event.clientY) || 0) - last.y;
        this.camera.dragLast = { x: Number(event.clientX) || 0, y: Number(event.clientY) || 0 };
        if (dx || dy) this.applyLook(dx, dy);
      };
      this.handleBattlePointerDown = (event) => {
        if (this.destroyed) return;
        if (event.button === 0 && document.pointerLockElement !== this.canvas) {
          this.suppressShotUntil = performance.now() + 240;
          return;
        }
        if (event.button !== 2) return;
        event.preventDefault();
        this.camera.dragging = true;
        this.camera.dragLast = { x: Number(event.clientX) || 0, y: Number(event.clientY) || 0 };
        try { this.canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }
      };
      this.handleBattlePointerUp = (event) => {
        if (event.button === 2 || event.type === 'pointercancel') this.camera.dragging = false;
      };
      this.handleBattleClick = () => {
        if (this.destroyed || !this.running || this.paused || this.ended) return;
        if (document.pointerLockElement === this.canvas) return;
        this.requestMouseLock();
        this.suppressShotUntil = performance.now() + 160;
      };
      this.handlePointerLockChange = () => {
        this.camera.locked = document.pointerLockElement === this.canvas;
        this.emitHud(true);
      };
      this.handlePointerLockError = () => {
        this.camera.locked = false;
        this.emitHud(true);
      };

      window.addEventListener('keydown', this.handleBattleKeyDown, { passive: false });
      document.addEventListener('pointermove', this.handleBattleLook);
      document.addEventListener('pointerlockchange', this.handlePointerLockChange);
      document.addEventListener('pointerlockerror', this.handlePointerLockError);
      window.addEventListener('pointerup', this.handleBattlePointerUp);
      this.canvas.addEventListener('pointerdown', this.handleBattlePointerDown);
      this.canvas.addEventListener('pointercancel', this.handleBattlePointerUp);
      this.canvas.addEventListener('click', this.handleBattleClick);
    }

    unbindBattleEvents() {
      window.removeEventListener('keydown', this.handleBattleKeyDown);
      document.removeEventListener('pointermove', this.handleBattleLook);
      document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
      document.removeEventListener('pointerlockerror', this.handlePointerLockError);
      window.removeEventListener('pointerup', this.handleBattlePointerUp);
      this.canvas.removeEventListener('pointerdown', this.handleBattlePointerDown);
      this.canvas.removeEventListener('pointercancel', this.handleBattlePointerUp);
      this.canvas.removeEventListener('click', this.handleBattleClick);
    }

    start() {
      super.start();
      this.requestMouseLock();
    }

    pause() {
      super.pause();
      this.mouse.down = false;
      this.camera.dragging = false;
      this.exitMouseLock();
    }

    resume() {
      super.resume();
    }

    destroy() {
      this.unbindBattleEvents();
      this.exitMouseLock();
      super.destroy();
    }

    requestMouseLock() {
      if (document.pointerLockElement === this.canvas) return;
      const attempt = (options) => {
        try {
          const result = options ? this.canvas.requestPointerLock(options) : this.canvas.requestPointerLock();
          return result && typeof result.then === 'function' ? result : Promise.resolve();
        } catch {
          return Promise.reject();
        }
      };
      attempt({ unadjustedMovement: true }).catch(() => {
        attempt().catch(() => { /* pointer lock unavailable — right-drag and arrow keys still work */ });
      });
    }

    exitMouseLock() {
      if (document.pointerLockElement === this.canvas) {
        try { document.exitPointerLock(); } catch { /* ignore */ }
      }
      this.camera.locked = false;
    }

    applyLook(dx, dy) {
      const limit = 90;
      const mx = clamp(Number(dx) || 0, -limit, limit);
      const my = clamp(Number(dy) || 0, -limit, limit);
      this.camera.yaw = normalizeAngle(this.camera.yaw + mx * BATTLE.mouseSensitivity);
      this.camera.pitch = clamp(this.camera.pitch - my * BATTLE.mouseSensitivity * 0.9, -0.5, 0.62);
    }

    jump() {
      const player = this.player;
      if (!player.alive || !player.grounded) return;
      player.vy = BATTLE.jumpSpeed;
      player.grounded = false;
    }

    reload() {
      const player = this.player;
      if (!player.alive) return;
      const weapon = WEAPONS[player.weapon] || WEAPONS.pistol;
      if (player.reloadTimer > 0 || player.mag >= weapon.mag || player.reserve <= 0) return;
      player.reloadTimer = weapon.reload || 1;
      this.emitHud(true);
    }

    finishReload() {
      const player = this.player;
      const weapon = WEAPONS[player.weapon] || WEAPONS.pistol;
      const need = weapon.mag - player.mag;
      const take = Math.max(0, Math.min(need, player.reserve));
      player.mag += take;
      player.reserve -= take;
      player.reloadTimer = 0;
      this.emitHud(true);
    }

    interact() {
      if (!this.running || this.paused || this.ended || !this.player.alive) return;
      const chest = this.nearestChest();
      if (!chest) return;
      this.openChest(chest);
    }

    nearestChest() {
      let best = null;
      let bestDistance = 3.1;
      for (const chest of this.chests) {
        if (chest.opened) continue;
        const dist = distance(this.player.x, this.player.z, chest.x, chest.z);
        if (dist < bestDistance) {
          best = chest;
          bestDistance = dist;
        }
      }
      return best;
    }

    traceShot(origin, direction, range, ownerId) {
      const dir = normalizeV(direction);
      const world = this.raycastWorld(origin, dir, range);
      let best = world
        ? { type: 'world', distance: world.distance, point: world.point, kind: world.kind }
        : null;
      for (const entity of this.entities()) {
        if (entity.id === ownerId) continue;
        const base = { x: entity.x, y: entity.y, z: entity.z };
        const body = rayCylinderHit(origin, dir, base, entity.radius + 0.06, entity.height - 0.35, range);
        const head = raySphereHit(
          origin,
          dir,
          { x: entity.x, y: entity.y + entity.height - 0.12, z: entity.z },
          0.24,
          range,
        );
        let hit = null;
        if (head && (!body || head.distance <= body.distance)) hit = { ...head, head: true };
        else if (body) hit = { ...body, head: false };
        if (hit && (!best || hit.distance < best.distance)) {
          best = {
            type: 'entity',
            entity,
            distance: hit.distance,
            point: hit.point,
            head: hit.head,
          };
        }
      }
      return best;
    }

    firePlayer() {
      const player = this.player;
      if (!player.alive || player.reloadTimer > 0 || this.pendingEnd) return;
      if (performance.now() < this.suppressShotUntil) return;
      const weapon = WEAPONS[player.weapon] || WEAPONS.pistol;
      if (player.cooldown > 0) return;
      if (player.mag <= 0) {
        this.reload();
        return;
      }
      const basis = this.camera.basis;
      if (!basis) return;
      player.cooldown = weapon.fireRate;
      player.mag -= 1;
      player.spreadVisual = Math.min(1, player.spreadVisual + (weapon.pellets > 1 ? 0.7 : 0.32));
      this.stats.shots += 1;
      this.camera.kick = Math.min(0.18, this.camera.kick + (weapon.recoil || 0.016));
      this.camera.shake = Math.min(1, this.camera.shake + 0.16);

      const right = this.rightVector();
      const flatForward = { x: Math.sin(this.camera.yaw), y: 0, z: Math.cos(this.camera.yaw) };
      const muzzle = {
        x: player.x + right.x * 0.36 + flatForward.x * 0.7,
        y: player.y + 1.15,
        z: player.z + right.z * 0.36 + flatForward.z * 0.7,
      };
      const moving = player.moveAmount;
      const spread = (weapon.spread || 0.02)
        * (1 + (moving > 0.12 ? 0.5 : 0) + (player.grounded ? 0 : 0.65))
        + player.spreadVisual * 0.012;
      const origin = basis.position;
      for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
        const direction = normalizeV(addV(
          basis.forward,
          addV(
            scaleV(basis.right, (Math.random() - 0.5) * spread * 2),
            scaleV(basis.up, (Math.random() - 0.5) * spread * 2),
          ),
        ));
        const hit = this.traceShot(origin, direction, weapon.range, player.id);
        const end = hit ? hit.point : addV(origin, scaleV(direction, weapon.range));
        this.tracers.push({ from: muzzle, to: end, color: weapon.color, life: 0.07, maxLife: 0.07 });
        if (!hit) continue;
        if (hit.type === 'entity') {
          const falloff = clamp(1 - (hit.distance / weapon.range) * 0.45, 0.55, 1);
          const damage = weapon.damage * falloff * (hit.head ? 1.8 : 1);
          this.stats.hits += 1;
          this.stats.damage += damage;
          this.hitMarker = 0.16;
          this.damageEntity(hit.entity, damage, player.id, 'player');
          this.spawnBurst(hit.point, hit.head ? '#ffd166' : '#ff8095', hit.head ? 7 : 4, 2.4);
          this.addFloater(
            `${Math.round(damage)}${hit.head ? '!' : ''}`,
            hit.point,
            hit.head ? '#ffd166' : '#d8fff0',
          );
        } else {
          this.spawnBurst(hit.point, hit.kind === 'ground' ? '#6d8d7c' : '#c8b58f', 3, 1.6);
        }
      }
      this.emitHud(true);
    }

    fireBot(bot) {
      const target = bot.targetId == null ? null : this.entityById(bot.targetId);
      if (!target || !target.alive) return;
      const weapon = WEAPONS[bot.weapon] || WEAPONS.pistol;
      if (bot.cooldown > 0) return;
      bot.cooldown = weapon.fireRate * 1.5 + Math.random() * 0.16;
      const origin = { x: bot.x, y: 1.32, z: bot.z };
      const aim = {
        x: target.x + (Math.random() - 0.5) * 0.5,
        y: target.y + 1.05 + (Math.random() - 0.5) * 0.35,
        z: target.z + (Math.random() - 0.5) * 0.5,
      };
      const baseDir = normalizeV(subV(aim, origin));
      const spread = bot.aimError + (weapon.pellets > 1 ? 0.02 : 0);
      const direction = normalizeV(addV(baseDir, {
        x: (Math.random() - 0.5) * spread * 2,
        y: (Math.random() - 0.5) * spread,
        z: (Math.random() - 0.5) * spread * 2,
      }));
      const hit = this.traceShot(origin, direction, weapon.range, bot.id);
      const end = hit ? hit.point : addV(origin, scaleV(direction, weapon.range));
      this.tracers.push({ from: { x: origin.x, y: 1.2, z: origin.z }, to: end, color: '#ff8a8a', life: 0.08, maxLife: 0.08 });
      if (!hit || hit.type !== 'entity') return;
      const falloff = clamp(1 - (hit.distance / weapon.range) * 0.4, 0.5, 1);
      const damage = weapon.damage * falloff * (0.5 + Math.random() * 0.1) * (hit.head ? 1.4 : 1);
      this.damageEntity(hit.entity, damage, bot.id, 'bot');
    }

    damageEntity(entity, amount, ownerId, source) {
      if (!entity || !entity.alive || amount <= 0) return;
      const absorbed = Math.min(entity.shield, amount);
      entity.shield -= absorbed;
      entity.hp -= amount - absorbed;
      if (entity.isPlayer) {
        this.damageFlash = Math.min(1, this.damageFlash + (source === 'storm' ? 0.05 : 0.4));
        if (source !== 'storm') this.camera.shake = Math.min(1.2, this.camera.shake + 0.35);
      }
      if (entity.hp <= 0) this.killEntity(entity, ownerId, source);
    }

    killEntity(entity, ownerId, source) {
      if (!entity.alive) return;
      entity.alive = false;
      entity.hp = 0;
      entity.shield = 0;
      this.spawnBurst({ x: entity.x, y: entity.y + 1, z: entity.z }, entity.color, entity.isPlayer ? 18 : 12, 4);
      const killer = ownerId == null ? null : this.entityById(ownerId);
      if (entity.isPlayer) {
        const placement = this.aliveCount() + 1;
        this.addKillFeed(
          source === 'storm'
            ? this.t('Strefa pochłonęła Cię', 'The storm consumed you')
            : this.t('Zostałeś wyeliminowany', 'You were eliminated'),
          '#ff8a9a',
        );
        this.pendingEnd = {
          at: this.clock + 1.5,
          result: { mode: 'battle', winner: 'bot', placement, kills: this.player.kills },
        };
        return;
      }
      if (killer?.isPlayer) {
        this.player.kills += 1;
        this.addKillFeed(
          this.t('Wyeliminowałeś {name}', 'You eliminated {name}').replace('{name}', entity.name),
          '#9ef7cf',
        );
      } else if (killer) {
        killer.kills += 1;
        this.addKillFeed(
          this.t('{killer} wyeliminował {name}', '{killer} eliminated {name}')
            .replace('{killer}', killer.name)
            .replace('{name}', entity.name),
          killer.color,
        );
      } else {
        this.addKillFeed(
          this.t('Strefa pochłonęła {name}', 'The storm consumed {name}').replace('{name}', entity.name),
          '#c7a1ff',
        );
      }
      this.dropLoot(entity);
      if (this.player.alive && this.bots.every((bot) => !bot.alive) && !this.pendingEnd) {
        this.pendingEnd = {
          at: this.clock + 1.1,
          result: { mode: 'battle', winner: 'player', placement: 1, kills: this.player.kills },
        };
      }
    }

    dropLoot(entity) {
      if (Math.random() > 0.72) return;
      const angle = Math.random() * TAU;
      const x = entity.x + Math.cos(angle) * 0.8;
      const z = entity.z + Math.sin(angle) * 0.8;
      const roll = Math.random();
      if (roll < 0.32) {
        this.spawnPickup(x, z, 'health');
      } else if (roll < 0.58) {
        this.spawnPickup(x, z, 'shield');
      } else if (roll < 0.82) {
        this.spawnPickup(x, z, 'ammo');
      } else {
        this.spawnPickup(x, z, 'weapon', LOOT_WEAPONS[Math.floor(Math.random() * LOOT_WEAPONS.length)]);
      }
    }

    spawnPickup(x, z, type, weaponId = '') {
      this.pickups.push({
        x,
        z,
        type,
        weaponId,
        phase: Math.random() * TAU,
        dead: false,
      });
    }

    openChest(chest) {
      if (chest.opened) return;
      chest.opened = true;
      const angle = Math.random() * TAU;
      this.spawnPickup(chest.x + Math.cos(angle) * 1.25, chest.z + Math.sin(angle) * 1.25, 'ammo');
      this.spawnPickup(
        chest.x + Math.cos(angle + TAU / 3) * 1.3,
        chest.z + Math.sin(angle + TAU / 3) * 1.3,
        Math.random() < 0.5 ? 'shield' : 'health',
      );
      if (Math.random() < 0.5) {
        this.spawnPickup(
          chest.x + Math.cos(angle + (TAU / 3) * 2) * 1.35,
          chest.z + Math.sin(angle + (TAU / 3) * 2) * 1.35,
          'weapon',
          LOOT_WEAPONS[Math.floor(Math.random() * LOOT_WEAPONS.length)],
        );
      }
      this.spawnBurst({ x: chest.x, y: 0.9, z: chest.z }, '#ffd166', 16, 3.4);
      this.addFloater(this.t('Skrzynia otwarta', 'Chest opened'), { x: chest.x, y: 1.8, z: chest.z }, '#ffd166');
      this.emitHud(true);
    }

    applyPickup(entity, pickup) {
      if (pickup.type === 'health') {
        entity.hp = Math.min(BATTLE.healthMax, entity.hp + 35);
        this.addFloater('+35', { x: pickup.x, y: 1.2, z: pickup.z }, '#79f2a8');
      } else if (pickup.type === 'shield') {
        entity.shield = Math.min(BATTLE.shieldMax, entity.shield + 30);
        this.addFloater('+30', { x: pickup.x, y: 1.2, z: pickup.z }, '#7cc8ff');
      } else if (pickup.type === 'ammo') {
        const weapon = WEAPONS[entity.weapon] || WEAPONS.pistol;
        entity.reserve = Math.min(weapon.reserve, entity.reserve + weapon.mag * 2);
        this.addFloater(this.t('Amunicja', 'Ammo'), { x: pickup.x, y: 1.2, z: pickup.z }, '#d8c9a0');
      } else if (pickup.type === 'weapon') {
        const weaponId = WEAPONS[pickup.weaponId] ? pickup.weaponId : 'smg';
        const weapon = WEAPONS[weaponId];
        entity.weapon = weaponId;
        entity.mag = weapon.mag;
        entity.reserve = weapon.reserve;
        entity.reloadTimer = 0;
        this.addFloater(this.weaponName(weaponId), { x: pickup.x, y: 1.25, z: pickup.z }, weapon.color);
      }
      this.spawnBurst({ x: pickup.x, y: 0.6, z: pickup.z }, pickup.type === 'health' ? '#79f2a8' : pickup.type === 'shield' ? '#7cc8ff' : '#ffd166', 8, 2.2);
      if (entity.isPlayer) this.emitHud(true);
    }

    spawnBurst(point, color, count, speed = 3) {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * TAU;
        const lift = Math.random() * 0.9 + 0.15;
        const life = 0.3 + Math.random() * 0.45;
        this.particles.push({
          x: point.x,
          y: point.y,
          z: point.z,
          vx: Math.cos(angle) * speed * (0.35 + Math.random() * 0.65),
          vy: lift * speed * 0.8,
          vz: Math.sin(angle) * speed * (0.35 + Math.random() * 0.65),
          life,
          maxLife: life,
          color,
          size: 0.04 + Math.random() * 0.07,
        });
      }
    }

    addFloater(text, point, color = '#ffffff') {
      this.floaters.push({
        text: String(text),
        x: point.x,
        y: point.y,
        z: point.z,
        color,
        life: 1.05,
        maxLife: 1.05,
      });
      if (this.floaters.length > 40) this.floaters.shift();
    }

    addKillFeed(text, color = '#ffffff') {
      this.killFeed.unshift({ text, color, age: 0 });
      if (this.killFeed.length > 5) this.killFeed.pop();
    }

    findBotTarget(bot) {
      let best = null;
      let bestDistance = 52;
      for (const entity of this.entities()) {
        if (entity.id === bot.id) continue;
        const dist = distance(bot.x, bot.z, entity.x, entity.z);
        if (dist < bestDistance) {
          best = entity;
          bestDistance = dist;
        }
      }
      return best;
    }

    updateBot(bot, dt, radius) {
      if (!bot.alive) return;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.think -= dt;
      if (bot.think <= 0) {
        bot.think = 0.35 + Math.random() * 0.45;
        const target = this.findBotTarget(bot);
        bot.targetId = target ? target.id : null;
        if (Math.random() < 0.3) bot.strafeDir *= -1;
      }
      const distCenter = Math.hypot(bot.x, bot.z);
      const outside = distCenter > radius - 5;
      const target = bot.targetId == null ? null : this.entityById(bot.targetId);
      let moveX = 0;
      let moveZ = 0;
      if (outside) {
        const length = distCenter || 1;
        moveX = -bot.x / length;
        moveZ = -bot.z / length;
        bot.yaw = Math.atan2(moveX, moveZ);
        bot.targetId = null;
      } else if (target?.alive) {
        const dx = target.x - bot.x;
        const dz = target.z - bot.z;
        const dist = Math.hypot(dx, dz) || 1;
        bot.yaw = Math.atan2(dx, dz) + Math.sin(this.clock * 2.6 + bot.seed) * bot.aimError * 0.7;
        if (dist < 46 && this.lineOfSight(
          { x: bot.x, y: 1.32, z: bot.z },
          { x: target.x, y: target.y + 1.1, z: target.z },
        )) {
          this.fireBot(bot);
        }
        let forward = 0;
        if (dist > 20) forward = 1;
        else if (dist < 8) forward = -1;
        moveX = (dx / dist) * forward + (-dz / dist) * bot.strafeDir * 0.7;
        moveZ = (dz / dist) * forward + (dx / dist) * bot.strafeDir * 0.7;
      } else {
        const length = distCenter || 1;
        bot.wanderAngle += (Math.random() - 0.5) * dt * 2;
        moveX = (-bot.x / length) * 0.65 + Math.cos(bot.wanderAngle) * 0.5;
        moveZ = (-bot.z / length) * 0.65 + Math.sin(bot.wanderAngle) * 0.5;
        bot.yaw = Math.atan2(moveX, moveZ);
      }
      const length = Math.hypot(moveX, moveZ);
      if (length > 0.02) {
        const step = (bot.speed * dt) / length;
        const beforeX = bot.x;
        const beforeZ = bot.z;
        this.moveEntity(bot, moveX * step, moveZ * step);
        if (Math.hypot(bot.x - beforeX, bot.z - beforeZ) < 0.008) bot.wanderAngle += 1.7;
        bot.moveAmount = 1;
      } else {
        bot.moveAmount = 0;
      }
    }

    separateBots() {
      const alive = this.bots.filter((bot) => bot.alive);
      for (let i = 0; i < alive.length; i += 1) {
        for (let j = i + 1; j < alive.length; j += 1) {
          const a = alive[i];
          const b = alive[j];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.001 || dist > 1.15) continue;
          const push = (1.15 - dist) / 2;
          const nx = dx / dist;
          const nz = dz / dist;
          if (!this.collidesAt(a.x - nx * push, a.z - nz * push, a.radius, a.y)) {
            a.x -= nx * push;
            a.z -= nz * push;
          }
          if (!this.collidesAt(b.x + nx * push, b.z + nz * push, b.radius, b.y)) {
            b.x += nx * push;
            b.z += nz * push;
          }
        }
      }
    }

    updatePlayer(dt) {
      const player = this.player;
      player.cooldown = Math.max(0, player.cooldown - dt);
      player.spreadVisual = Math.max(0, player.spreadVisual - dt * 1.8);
      if (player.reloadTimer > 0) {
        player.reloadTimer = Math.max(0, player.reloadTimer - dt);
        if (player.reloadTimer === 0) this.finishReload();
      }
      if (!player.alive) return;

      if (this.keys.has('ArrowLeft')) this.camera.yaw = normalizeAngle(this.camera.yaw - dt * 1.8);
      if (this.keys.has('ArrowRight')) this.camera.yaw = normalizeAngle(this.camera.yaw + dt * 1.8);
      if (this.keys.has('ArrowUp')) this.camera.pitch = clamp(this.camera.pitch + dt * 1.1, -0.5, 0.62);
      if (this.keys.has('ArrowDown')) this.camera.pitch = clamp(this.camera.pitch - dt * 1.1, -0.5, 0.62);

      const inputX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      const inputZ = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      const forward = { x: Math.sin(this.camera.yaw), z: Math.cos(this.camera.yaw) };
      const right = this.rightVector();
      let moveX = forward.x * inputZ + right.x * inputX;
      let moveZ = forward.z * inputZ + right.z * inputX;
      const length = Math.hypot(moveX, moveZ);
      if (length > 0.01) {
        moveX /= length;
        moveZ /= length;
        player.moveAmount = 1;
      } else {
        player.moveAmount = 0;
      }
      const sprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && inputZ > 0;
      const speed = (sprinting ? BATTLE.sprintSpeed : BATTLE.walkSpeed) * (player.grounded ? 1 : 0.82);
      if (length > 0.01) this.moveEntity(player, moveX * speed * dt, moveZ * speed * dt);

      player.vy -= BATTLE.gravity * dt;
      player.y += player.vy * dt;
      if (player.y <= 0) {
        player.y = 0;
        player.vy = 0;
        player.grounded = true;
      } else {
        player.grounded = false;
      }
      player.yaw = this.camera.yaw;
      if (this.mouse.down) this.firePlayer();
    }

    updatePickups(dt) {
      const player = this.player;
      for (const pickup of this.pickups) {
        pickup.phase += dt * 3;
        if (pickup.dead || !player.alive) continue;
        if (distance(player.x, player.z, pickup.x, pickup.z) <= 1.55) {
          this.applyPickup(player, pickup);
          pickup.dead = true;
        }
      }
      if (this.pickups.some((pickup) => pickup.dead)) {
        this.pickups = this.pickups.filter((pickup) => !pickup.dead);
      }
    }

    updateParticles(dt) {
      for (const particle of this.particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.z += particle.vz * dt;
        particle.vy -= 12 * dt;
        particle.life -= dt;
      }
      if (this.particles.some((particle) => particle.life <= 0 || particle.y < 0)) {
        this.particles = this.particles.filter((particle) => particle.life > 0 && particle.y >= 0);
      }
    }

    updateEffects(dt) {
      for (const tracer of this.tracers) tracer.life -= dt;
      if (this.tracers.some((tracer) => tracer.life <= 0)) {
        this.tracers = this.tracers.filter((tracer) => tracer.life > 0);
      }
      for (const floater of this.floaters) {
        floater.life -= dt;
        floater.y += dt * 0.85;
      }
      if (this.floaters.some((floater) => floater.life <= 0)) {
        this.floaters = this.floaters.filter((floater) => floater.life > 0);
      }
      for (const entry of this.killFeed) entry.age += dt;
      if (this.killFeed.some((entry) => entry.age > 6)) {
        this.killFeed = this.killFeed.filter((entry) => entry.age <= 6);
      }
      this.hitMarker = Math.max(0, this.hitMarker - dt);
      this.damageFlash = Math.max(0, this.damageFlash - dt * 2.1);
    }

    applyStorm(dt, radius) {
      for (const entity of this.entities()) {
        if (Math.hypot(entity.x, entity.z) > radius) {
          this.damageEntity(entity, BATTLE.stormDamage * dt, null, 'storm');
        }
      }
    }

    update(dt) {
      if (this.ended) return;
      this.clock += dt;
      this.storm.elapsed += dt;
      const radius = this.currentStormRadius();
      this.updateCamera(dt);
      this.updatePlayer(dt);
      for (const bot of this.bots) this.updateBot(bot, dt, radius);
      this.separateBots();
      this.updatePickups(dt);
      this.updateParticles(dt);
      this.updateEffects(dt);
      this.applyStorm(dt, radius);
      if (this.pendingEnd && this.clock >= this.pendingEnd.at) {
        const result = this.pendingEnd.result;
        this.pendingEnd = null;
        this.finish(result);
      }
    }

    hudState() {
      const player = this.player;
      const radius = this.currentStormRadius();
      const outside = Math.hypot(player.x, player.z) > radius;
      return {
        mode: 'battle',
        playerName: this.t('Ty', 'You'),
        hp: Math.max(0, Math.ceil(player.hp)),
        shield: Math.max(0, Math.ceil(player.shield)),
        alive: this.aliveCount(),
        kills: player.kills,
        weapon: this.weaponName(player.weapon),
        weaponId: player.weapon,
        ammoMag: Math.max(0, Math.ceil(player.mag)),
        ammoReserve: Math.max(0, Math.ceil(player.reserve)),
        reloading: player.reloadTimer > 0,
        stormLabel: this.stormLabel(),
        outside,
        chestNear: Boolean(this.nearestChest()),
        locked: this.camera.locked,
      };
    }

    horizonY(basis, focal) {
      const forward = { x: Math.sin(this.camera.yaw), y: 0, z: Math.cos(this.camera.yaw) };
      const far = addV(basis.position, scaleV(forward, 4000));
      const point = projectPoint(far, basis, focal, this.view.w, this.view.h);
      return point.visible ? point.y : this.view.h / 2;
    }

    drawBackdrop(ctx) {
      const { w, h } = this.view;
      const basis = this.camera.basis;
      const focal = this.focal();
      const horizon = this.horizonY(basis, focal);
      const horizonClamped = clamp(horizon, -h * 4, h * 4);
      const skyBottom = clamp(horizonClamped, 0, h);
      if (skyBottom > 0) {
        const sky = ctx.createLinearGradient(0, -20, 0, Math.max(12, skyBottom));
        sky.addColorStop(0, '#2f86cf');
        sky.addColorStop(0.44, '#68bfe4');
        sky.addColorStop(0.78, '#b7e7f2');
        sky.addColorStop(1, '#ffe3b3');
        ctx.fillStyle = sky;
        ctx.fillRect(-30, -30, w + 60, skyBottom + 60);
      }

      const sunDirection = normalizeV({ x: -0.5, y: 0.52, z: -0.66 });
      const sunPoint = addV(basis.position, scaleV(sunDirection, 2600));
      const sun = projectPoint(sunPoint, basis, focal, w, h);
      if (sun.visible && sun.y < horizon + 40) {
        const radius = Math.max(36, focal * 0.1);
        const glow = ctx.createRadialGradient(sun.x, sun.y, 2, sun.x, sun.y, radius);
        glow.addColorStop(0, 'rgba(255, 252, 234, 1)');
        glow.addColorStop(0.22, 'rgba(255, 228, 164, 0.88)');
        glow.addColorStop(0.55, 'rgba(255, 205, 130, 0.28)');
        glow.addColorStop(1, 'rgba(255, 190, 120, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, radius, 0, TAU);
        ctx.fill();
      }

      const clouds = [
        { az: -0.9, alt: 0.42, size: 1.1 },
        { az: 0.35, alt: 0.55, size: 0.8 },
        { az: 1.9, alt: 0.36, size: 1.3 },
        { az: -2.3, alt: 0.5, size: 0.7 },
        { az: 2.9, alt: 0.62, size: 0.95 },
      ];
      for (const cloud of clouds) {
        const dir = normalizeV({
          x: Math.sin(cloud.az) * Math.cos(cloud.alt),
          y: Math.sin(cloud.alt),
          z: Math.cos(cloud.az) * Math.cos(cloud.alt),
        });
        const point = projectPoint(addV(basis.position, scaleV(dir, 1500)), basis, focal, w, h);
        if (!point.visible || point.y > horizon - 10) continue;
        const width = focal * 0.09 * cloud.size;
        const height = width * 0.32;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
        ctx.beginPath();
        ctx.ellipse(point.x, point.y, width, height, 0, 0, TAU);
        ctx.ellipse(point.x - width * 0.7, point.y + height * 0.25, width * 0.6, height * 0.7, 0, 0, TAU);
        ctx.ellipse(point.x + width * 0.65, point.y + height * 0.2, width * 0.72, height * 0.62, 0, 0, TAU);
        ctx.fill();
      }

      if (horizonClamped > -h * 1.6 && horizonClamped < h * 1.6) {
        for (let layer = 0; layer < 2; layer += 1) {
          const base = horizonClamped + 6;
          const amplitude = layer === 0 ? 56 : 34;
          ctx.beginPath();
          ctx.moveTo(-30, base + 12);
          for (let x = -30; x <= w + 30; x += 24) {
            const angle = this.camera.yaw + (x - w / 2) / focal;
            const ridge = Math.sin(angle * 2.1 + layer * 2.4) * 0.5
              + Math.sin(angle * 5.4 + layer * 1.1) * 0.3
              + Math.sin(angle * 9.7 + layer * 0.7) * 0.2;
            const peak = amplitude * (0.55 + 0.45 * ridge);
            ctx.lineTo(x, base - peak);
          }
          ctx.lineTo(w + 30, base + 12);
          ctx.closePath();
          ctx.fillStyle = layer === 0 ? 'rgba(112, 172, 156, 0.88)' : 'rgba(60, 122, 105, 0.95)';
          ctx.fill();
        }
      }

      if (horizonClamped < h) {
        const groundTop = Math.max(0, horizonClamped);
        const ground = ctx.createLinearGradient(0, groundTop, 0, h);
        ground.addColorStop(0, '#6cbf82');
        ground.addColorStop(0.26, '#4a9e63');
        ground.addColorStop(0.64, '#347c4e');
        ground.addColorStop(1, '#225c3a');
        ctx.fillStyle = ground;
        ctx.fillRect(-30, groundTop, w + 60, h - groundTop + 30);
      }
    }

    drawGround(ctx) {
      const { w, h } = this.view;
      const basis = this.camera.basis;
      const focal = this.focal();
      const player = this.player;

      const disc = (radius, segments, y, fill) => {
        const points = [];
        for (let index = 0; index < segments; index += 1) {
          const angle = (index / segments) * TAU;
          points.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius });
        }
        this.groundPolygon(ctx, points, fill);
      };
      disc(900, 48, 0, '#2f9bb2');
      disc(236, 64, 0.004, '#e7d6a6');
      disc(220.6, 64, 0.008, '#3f8d57');

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(236, 255, 242, 0.13)';
      ctx.beginPath();
      const range = 96;
      const stepSize = 8;
      const startX = Math.floor((player.x - range) / stepSize) * stepSize;
      const startZ = Math.floor((player.z - range) / stepSize) * stepSize;
      for (let x = startX; x <= player.x + range; x += stepSize) {
        const seg = projectSegment(
          { x, y: 0.02, z: player.z - range },
          { x, y: 0.02, z: player.z + range },
          basis, focal, w, h,
        );
        if (!seg) continue;
        ctx.moveTo(seg.ax, seg.ay);
        ctx.lineTo(seg.bx, seg.by);
      }
      for (let z = startZ; z <= player.z + range; z += stepSize) {
        const seg = projectSegment(
          { x: player.x - range, y: 0.02, z },
          { x: player.x + range, y: 0.02, z },
          basis, focal, w, h,
        );
        if (!seg) continue;
        ctx.moveTo(seg.ax, seg.ay);
        ctx.lineTo(seg.bx, seg.by);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(130, 226, 190, 0.075)';
      ctx.beginPath();
      for (let radius = 34; radius < this.arena.radius - 8; radius += 34) {
        const segments = 64;
        for (let index = 0; index < segments; index += 1) {
          const a1 = (index / segments) * TAU;
          const a2 = ((index + 1) / segments) * TAU;
          const seg = projectSegment(
            { x: Math.cos(a1) * radius, y: 0.03, z: Math.sin(a1) * radius },
            { x: Math.cos(a2) * radius, y: 0.03, z: Math.sin(a2) * radius },
            basis, focal, w, h,
          );
          if (!seg) continue;
          ctx.moveTo(seg.ax, seg.ay);
          ctx.lineTo(seg.bx, seg.by);
        }
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(62, 224, 163, 0.26)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let index = 0; index < 96; index += 1) {
        const a1 = (index / 96) * TAU;
        const a2 = ((index + 1) / 96) * TAU;
        const radius = this.arena.radius - 1.5;
        const seg = projectSegment(
          { x: Math.cos(a1) * radius, y: 0.04, z: Math.sin(a1) * radius },
          { x: Math.cos(a2) * radius, y: 0.04, z: Math.sin(a2) * radius },
          basis, focal, w, h,
        );
        if (!seg) continue;
        ctx.moveTo(seg.ax, seg.ay);
        ctx.lineTo(seg.bx, seg.by);
      }
      ctx.stroke();

      const stormRadiusNow = this.currentStormRadius();
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(160, 96, 255, 0.08)';
      ctx.beginPath();
      for (let index = 0; index < 96; index += 1) {
        const a1 = (index / 96) * TAU;
        const a2 = ((index + 1) / 96) * TAU;
        const seg = projectSegment(
          { x: Math.cos(a1) * stormRadiusNow, y: 0.06, z: Math.sin(a1) * stormRadiusNow },
          { x: Math.cos(a2) * stormRadiusNow, y: 0.06, z: Math.sin(a2) * stormRadiusNow },
          basis, focal, w, h,
        );
        if (!seg) continue;
        ctx.moveTo(seg.ax, seg.ay);
        ctx.lineTo(seg.bx, seg.by);
      }
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = 'rgba(198, 148, 255, 0.72)';
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -this.clock * 26;
      ctx.beginPath();
      for (let index = 0; index < 96; index += 1) {
        const a1 = (index / 96) * TAU;
        const a2 = ((index + 1) / 96) * TAU;
        const seg = projectSegment(
          { x: Math.cos(a1) * stormRadiusNow, y: 0.07, z: Math.sin(a1) * stormRadiusNow },
          { x: Math.cos(a2) * stormRadiusNow, y: 0.07, z: Math.sin(a2) * stormRadiusNow },
          basis, focal, w, h,
        );
        if (!seg) continue;
        ctx.moveTo(seg.ax, seg.ay);
        ctx.lineTo(seg.bx, seg.by);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      for (const chest of this.chests) {
        if (chest.opened) continue;
        const dist = distance(player.x, player.z, chest.x, chest.z);
        if (dist > 44) continue;
        const pulse = 0.14 + Math.sin(this.clock * 3 + chest.phase) * 0.05;
        ctx.strokeStyle = `rgba(255, 209, 102, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let index = 0; index < 18; index += 1) {
          const a1 = (index / 18) * TAU;
          const a2 = ((index + 1) / 18) * TAU;
          const seg = projectSegment(
            { x: chest.x + Math.cos(a1) * 1.15, y: 0.08, z: chest.z + Math.sin(a1) * 1.15 },
            { x: chest.x + Math.cos(a2) * 1.15, y: 0.08, z: chest.z + Math.sin(a2) * 1.15 },
            basis, focal, w, h,
          );
          if (!seg) continue;
          ctx.moveTo(seg.ax, seg.ay);
          ctx.lineTo(seg.bx, seg.by);
        }
        ctx.stroke();
      }

      for (const chest of this.chests) {
        if (chest.opened) continue;
        const dist = distance(player.x, player.z, chest.x, chest.z);
        if (dist > 30) continue;
        const bob = 0.3 + Math.sin(this.clock * 2.5 + chest.phase) * 0.08;
        const point = projectPoint({ x: chest.x, y: 1.85 + bob, z: chest.z }, basis, focal, w, h);
        if (!point.visible || point.depth > 30) continue;
        const size = clamp(11 * point.scale, 8, 20);
        ctx.fillStyle = 'rgba(255, 209, 102, 0.9)';
        ctx.font = `800 ${size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('▾', point.x, point.y);
      }

      const shadowOffsetX = 2.2;
      const shadowOffsetZ = 1.4;
      for (const box of this.buildings) {
        this.groundPolygon(ctx, [
          { x: box.x - box.w / 2 + shadowOffsetX, y: 0.09, z: box.z - box.d / 2 + shadowOffsetZ },
          { x: box.x + box.w / 2 + shadowOffsetX, y: 0.09, z: box.z - box.d / 2 + shadowOffsetZ },
          { x: box.x + box.w / 2 + shadowOffsetX, y: 0.09, z: box.z + box.d / 2 + shadowOffsetZ },
          { x: box.x - box.w / 2 + shadowOffsetX, y: 0.09, z: box.z + box.d / 2 + shadowOffsetZ },
        ], 'rgba(0, 0, 0, 0.19)');
      }
      for (const box of this.covers) {
        this.groundPolygon(ctx, [
          { x: box.x - box.w / 2 + 0.7, y: 0.09, z: box.z - box.d / 2 + 0.45 },
          { x: box.x + box.w / 2 + 0.7, y: 0.09, z: box.z - box.d / 2 + 0.45 },
          { x: box.x + box.w / 2 + 0.7, y: 0.09, z: box.z + box.d / 2 + 0.45 },
          { x: box.x - box.w / 2 + 0.7, y: 0.09, z: box.z + box.d / 2 + 0.45 },
        ], 'rgba(0, 0, 0, 0.16)');
      }
      for (const tree of this.trees) {
        this.groundCircle(ctx, tree.x + 1.1, tree.z + 0.7, tree.canopyRadius * 0.72, 'rgba(0, 0, 0, 0.16)');
      }
      for (const rock of this.rocks) {
        this.groundCircle(ctx, rock.x + 0.55, rock.z + 0.4, rock.radius * 0.95, 'rgba(0, 0, 0, 0.17)');
      }
      const entities = this.entities();
      for (const entity of entities) {
        this.groundCircle(ctx, entity.x + 0.25, entity.z + 0.2, entity.radius * 0.95, 'rgba(0, 0, 0, 0.24)');
      }
    }

    groundCircle(ctx, x, z, radius, fill) {
      const points = [];
      for (let index = 0; index < 14; index += 1) {
        const angle = (index / 14) * TAU;
        points.push({ x: x + Math.cos(angle) * radius, y: 0.085, z: z + Math.sin(angle) * radius });
      }
      this.groundPolygon(ctx, points, fill);
    }

    groundPolygon(ctx, points, fill) {
      const basis = this.camera.basis;
      if (!basis) return;
      const clipped = clipPolygonNear(points.map((point) => toCameraSpace(point, basis)), BATTLE.cameraNear);
      if (clipped.length < 3) return;
      const focal = this.focal();
      ctx.beginPath();
      let started = false;
      for (const point of clipped) {
        const screen = projectCameraSpace(point, focal, this.view.w, this.view.h);
        if (!screen.visible) continue;
        if (!started) {
          ctx.moveTo(screen.x, screen.y);
          started = true;
        } else {
          ctx.lineTo(screen.x, screen.y);
        }
      }
      if (!started) return;
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }

    addFace(faces, worldPoints, color, options = {}) {
      const basis = this.camera.basis;
      if (!basis) return;
      const normal = options.normal ? normalizeV(options.normal) : null;
      if (normal && !options.doubleSided) {
        const center = worldPoints.reduce((acc, point) => addV(acc, point), vec3());
        const average = scaleV(center, 1 / worldPoints.length);
        if (dotV(normal, subV(basis.position, average)) <= 0) return;
      }
      const cameraPoints = worldPoints.map((point) => toCameraSpace(point, basis));
      const clipped = clipPolygonNear(cameraPoints, BATTLE.cameraNear);
      if (clipped.length < 3) return;
      const depth = clipped.reduce((sum, point) => sum + point.z, 0) / clipped.length;
      const focal = this.focal();
      const screen = [];
      for (const point of clipped) {
        const projected = projectCameraSpace(point, focal, this.view.w, this.view.h);
        if (!projected.visible) return;
        screen.push(projected);
      }
      const fog = clamp((depth - 34) / 180, 0, 0.48);
      const light = normal ? 0.74 + 0.52 * Math.max(0, dotV(normal, LIGHT_DIR)) : 1;
      faces.push({
        depth,
        points: screen,
        fill: options.raw ? color : shadeColor(color, light, fog),
        alpha: options.alpha == null ? 1 : options.alpha,
        additive: Boolean(options.additive),
        stroke: options.stroke !== false && !options.raw,
      });
    }

    addBox(faces, box) {
      const yaw = box.yaw || 0;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const halfW = box.w / 2;
      const halfH = box.h / 2;
      const halfD = box.d / 2;
      const rotate = (lx, lz) => ({ x: box.x + lx * cos + lz * sin, z: box.z - lx * sin + lz * cos });
      const corners = [
        [-halfW, -halfH, -halfD], [halfW, -halfH, -halfD], [halfW, -halfH, halfD], [-halfW, -halfH, halfD],
        [-halfW, halfH, -halfD], [halfW, halfH, -halfD], [halfW, halfH, halfD], [-halfW, halfH, halfD],
      ].map(([lx, ly, lz]) => {
        const world = rotate(lx, lz);
        return { x: world.x, y: box.y + ly, z: world.z };
      });
      const color = box.color;
      const sides = [
        { indices: [1, 2, 6, 5], normal: { x: cos, y: 0, z: -sin } },
        { indices: [0, 4, 7, 3], normal: { x: -cos, y: 0, z: sin } },
        { indices: [3, 7, 6, 2], normal: { x: sin, y: 0, z: cos } },
        { indices: [0, 1, 5, 4], normal: { x: -sin, y: 0, z: -cos } },
      ];
      for (const side of sides) {
        this.addFace(faces, side.indices.map((index) => corners[index]), color, {
          normal: side.normal,
          stroke: box.stroke,
        });
      }
      this.addFace(faces, [4, 5, 6, 7].map((index) => corners[index]), box.topColor || color, {
        normal: { x: 0, y: 1, z: 0 },
        stroke: box.stroke,
      });
    }

    addFacadeDetails(faces, box) {
      const halfW = box.w / 2;
      const halfD = box.d / 2;
      const low = Math.min(1.05, box.h * 0.36);
      const high = Math.min(low + 0.82, box.h - 0.22);
      if (high - low < 0.3) return;
      const offset = 0.02;
      const windowColor = '#244450';
      const sideWindows = (axis, sign) => {
        const horizontal = axis === 'z' ? box.w : box.d;
        const spread = Math.min(horizontal * 0.24, 1.55);
        for (const direction of [-1, 1]) {
          const center = direction * spread;
          let points;
          let normal;
          if (axis === 'z') {
            const z = box.z + sign * (halfD + offset);
            points = [
              { x: box.x + center - 0.34, y: low, z },
              { x: box.x + center + 0.34, y: low, z },
              { x: box.x + center + 0.34, y: high, z },
              { x: box.x + center - 0.34, y: high, z },
            ];
            normal = { x: 0, y: 0, z: sign };
          } else {
            const x = box.x + sign * (halfW + offset);
            points = [
              { x, y: low, z: box.z + center - 0.34 },
              { x, y: low, z: box.z + center + 0.34 },
              { x, y: high, z: box.z + center + 0.34 },
              { x, y: high, z: box.z + center - 0.34 },
            ];
            normal = { x: sign, y: 0, z: 0 };
          }
          this.addFace(faces, points, windowColor, { normal, stroke: false });
        }
      };
      sideWindows('z', 1);
      sideWindows('z', -1);
      sideWindows('x', 1);
      sideWindows('x', -1);
      if (box.w > 4 && box.h > 2.2) {
        const doorWidth = Math.min(1.1, box.w * 0.24);
        const doorHeight = Math.min(1.9, box.h - 0.2);
        const z = box.z + halfD + offset;
        this.addFace(faces, [
          { x: box.x - doorWidth / 2, y: 0.03, z },
          { x: box.x + doorWidth / 2, y: 0.03, z },
          { x: box.x + doorWidth / 2, y: doorHeight, z },
          { x: box.x - doorWidth / 2, y: doorHeight, z },
        ], '#4f3826', { normal: { x: 0, y: 0, z: 1 }, stroke: false });
      }
    }

    addCone(faces, x, baseY, z, radius, height, color, segments = 7) {
      const apex = { x, y: baseY + height, z };
      for (let index = 0; index < segments; index += 1) {
        const angle1 = (index / segments) * TAU;
        const angle2 = ((index + 1) / segments) * TAU;
        const p1 = { x: x + Math.cos(angle1) * radius, y: baseY, z: z + Math.sin(angle1) * radius };
        const p2 = { x: x + Math.cos(angle2) * radius, y: baseY, z: z + Math.sin(angle2) * radius };
        const midAngle = (angle1 + angle2) / 2;
        this.addFace(faces, [p1, p2, apex], color, {
          normal: { x: Math.cos(midAngle), y: radius / height, z: Math.sin(midAngle) },
          stroke: false,
        });
      }
    }

    collectWorldFaces(faces) {
      for (const box of this.buildings) {
        this.addBox(faces, {
          x: box.x, y: box.h / 2, z: box.z, w: box.w, h: box.h, d: box.d, color: box.color, topColor: box.roof,
        });
        this.addFacadeDetails(faces, box);
        this.addBox(faces, {
          x: box.x, y: box.h + 0.16, z: box.z,
          w: box.w + 0.55, h: 0.34, d: box.d + 0.55,
          color: box.roof, topColor: box.roof, stroke: false,
        });
        if (box.h > 4.4) {
          this.addBox(faces, {
            x: box.x + box.w * 0.2, y: box.h + 0.34 + 0.45, z: box.z - box.d * 0.16,
            w: Math.min(2.1, box.w * 0.34), h: 0.9, d: Math.min(1.7, box.d * 0.34),
            color: box.trim, topColor: box.trim, stroke: false,
          });
        }
      }
      for (const box of this.covers) {
        this.addBox(faces, {
          x: box.x, y: box.h / 2, z: box.z, w: box.w, h: box.h, d: box.d, color: box.color,
        });
      }
      for (const tree of this.trees) {
        this.addBox(faces, {
          x: tree.x, y: tree.trunkHeight / 2, z: tree.z,
          w: tree.radius * 2, h: tree.trunkHeight, d: tree.radius * 2,
          color: '#7a5236', topColor: '#63422b', stroke: false,
        });
        this.addCone(
          faces,
          tree.x,
          tree.trunkHeight * 0.72,
          tree.z,
          tree.canopyRadius,
          tree.canopyHeight,
          shadeColor('#3f9e58', tree.shade, 0),
          7,
        );
        this.addCone(
          faces,
          tree.x,
          tree.trunkHeight * 1.18,
          tree.z,
          tree.canopyRadius * 0.62,
          tree.canopyHeight * 0.72,
          shadeColor('#4fb469', tree.shade, 0),
          6,
        );
      }
      for (const rock of this.rocks) {
        this.addBox(faces, {
          x: rock.x, y: rock.height / 2, z: rock.z,
          w: rock.radius * 2, h: rock.height, d: rock.radius * 1.65,
          yaw: rock.yaw, color: rock.color, topColor: '#7b857f', stroke: false,
        });
        this.addBox(faces, {
          x: rock.x - rock.radius * 0.22, y: rock.height + rock.height * 0.18, z: rock.z + rock.radius * 0.18,
          w: rock.radius * 1.1, h: rock.height * 0.36, d: rock.radius * 0.9,
          yaw: rock.yaw + 0.4, color: rock.color, topColor: '#838d87', stroke: false,
        });
      }
      for (const chest of this.chests) {
        this.addBox(faces, {
          x: chest.x, y: 0.33, z: chest.z, w: 1.2, h: 0.66, d: 0.9,
          yaw: chest.yaw, color: '#6d5424', topColor: '#8a6a2f',
        });
        const lidOffset = chest.opened ? -0.62 : 0;
        this.addBox(faces, {
          x: chest.x + Math.sin(chest.yaw) * lidOffset,
          y: chest.opened ? 0.5 : 0.81,
          z: chest.z + Math.cos(chest.yaw) * lidOffset,
          w: 1.24, h: chest.opened ? 0.2 : 0.3, d: 0.94,
          yaw: chest.yaw, color: '#ffd166', topColor: '#ffe9a8', stroke: false,
        });
      }
    }

    collectStormFaces(faces, radius) {
      const segments = 72;
      const wallHeight = 17;
      for (let index = 0; index < segments; index += 1) {
        const angle1 = (index / segments) * TAU;
        const angle2 = ((index + 1) / segments) * TAU;
        const x1 = Math.cos(angle1) * radius;
        const z1 = Math.sin(angle1) * radius;
        const x2 = Math.cos(angle2) * radius;
        const z2 = Math.sin(angle2) * radius;
        this.addFace(faces, [
          { x: x1, y: 0, z: z1 },
          { x: x2, y: 0, z: z2 },
          { x: x2, y: wallHeight * 0.45, z: z2 },
          { x: x1, y: wallHeight * 0.45, z: z1 },
        ], 'rgba(154, 96, 242, 0.17)', { doubleSided: true, raw: true, stroke: false, additive: true });
        this.addFace(faces, [
          { x: x1, y: wallHeight * 0.45, z: z1 },
          { x: x2, y: wallHeight * 0.45, z: z2 },
          { x: x2, y: wallHeight, z: z2 },
          { x: x1, y: wallHeight, z: z1 },
        ], 'rgba(112, 62, 205, 0.07)', { doubleSided: true, raw: true, stroke: false, additive: true });
      }
    }

    drawFace(ctx, face) {
      if (typeof face.draw === 'function') {
        ctx.globalAlpha = 1;
        face.draw(ctx);
        return;
      }
      if (face.points.length < 3) return;
      ctx.globalAlpha = face.alpha;
      if (face.additive) ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.moveTo(face.points[0].x, face.points[0].y);
      for (let index = 1; index < face.points.length; index += 1) {
        ctx.lineTo(face.points[index].x, face.points[index].y);
      }
      ctx.closePath();
      ctx.fillStyle = face.fill;
      ctx.fill();
      if (face.stroke) {
        ctx.strokeStyle = face.fill;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    draw() {
      const { w, h } = this.view;
      if (w < 2 || h < 2) return;
      if (!this.camera.basis) this.updateCamera(0);
      const ctx = this.ctx;
      if (!ctx) return;
      const shake = this.camera.shake;
      const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 10 : 0;
      const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 8 : 0;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(shakeX, shakeY);
      this.drawBackdrop(ctx);
      this.drawGround(ctx);
      const faces = [];
      this.collectWorldFaces(faces);
      this.collectEntityFaces(faces);
      this.collectPickupFaces(faces);
      this.collectStormFaces(faces, this.currentStormRadius());
      faces.sort((a, b) => b.depth - a.depth);
      for (const face of faces) this.drawFace(ctx, face);
      this.drawEffects(ctx);
      ctx.restore();
      this.drawOverlay(ctx, w, h);
    }

    collectEntityFaces(faces) {
      const entities = this.entities();
      for (const entity of entities) {
        const yaw = entity.yaw;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const bob = entity.moveAmount ? Math.sin(this.clock * 9 + (entity.seed || 0)) * 0.03 : 0;
        const place = (lx, ly, lz, w, h, d, color, topColor) => {
          this.addBox(faces, {
            x: entity.x + lx * cos + lz * sin,
            y: entity.y + ly,
            z: entity.z - lx * sin + lz * cos,
            w, h, d, yaw, color, topColor, stroke: false,
          });
        };
        const legColor = shadeColor(entity.color, 0.42);
        place(-0.14, 0.32, 0, 0.19, 0.64, 0.24, legColor, shadeColor(entity.color, 0.5));
        place(0.14, 0.32, 0, 0.19, 0.64, 0.24, legColor, shadeColor(entity.color, 0.5));
        place(0, 0.96 + bob, 0, 0.58, 0.68, 0.36, entity.color, shadeColor(entity.color, 1.12));
        place(0, 1.52 + bob, 0, 0.34, 0.34, 0.34, '#1d332b', '#2a4c3f');
        place(-0.37, 0.98 + bob, 0.04, 0.15, 0.5, 0.19, shadeColor(entity.color, 0.74), shadeColor(entity.color, 0.82));
        place(0.37, 0.98 + bob, 0.04, 0.15, 0.5, 0.19, shadeColor(entity.color, 0.74), shadeColor(entity.color, 0.82));
        place(0, 0.98 + bob, -0.28, 0.4, 0.5, 0.18, '#223b31', '#2b4a3d');
        const weapon = WEAPONS[entity.weapon] || WEAPONS.pistol;
        place(0.3, 1.08 + bob, 0.42, 0.1, 0.14, 0.62, '#2c3a35', '#3c4f47');
        place(0.3, 1.08 + bob, 0.74, 0.06, 0.06, 0.18, weapon.color, weapon.color);
      }
      if (!this.player.alive) {
        this.addBox(faces, {
          x: this.player.x, y: 0.16, z: this.player.z,
          w: 1.1, h: 0.32, d: 1.5,
          yaw: this.player.yaw, color: this.player.color, topColor: '#7d3f4c', stroke: false,
        });
      }
    }

    pickupStyle(pickup) {
      if (pickup.type === 'health') return { color: '#79f2a8', glyph: '✚' };
      if (pickup.type === 'shield') return { color: '#7cc8ff', glyph: '◇' };
      if (pickup.type === 'ammo') return { color: '#d8c9a0', glyph: '▮' };
      const weapon = WEAPONS[pickup.weaponId] || WEAPONS.smg;
      return { color: weapon.color, glyph: '✦' };
    }

    collectPickupFaces(faces) {
      const basis = this.camera.basis;
      if (!basis) return;
      const focal = this.focal();
      for (const pickup of this.pickups) {
        const bob = Math.sin(this.clock * 3 + pickup.phase) * 0.12;
        const point = projectPoint(
          { x: pickup.x, y: 0.86 + bob, z: pickup.z },
          basis, focal, this.view.w, this.view.h,
        );
        if (!point.visible) continue;
        const style = this.pickupStyle(pickup);
        const size = clamp(point.scale * 0.32, 9, 34);
        faces.push({
          depth: point.depth,
          draw: (ctx) => {
            const glow = ctx.createRadialGradient(point.x, point.y, 1, point.x, point.y, size * 1.8);
            glow.addColorStop(0, style.color);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(point.x, point.y, size * 1.8, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(5, 13, 10, 0.82)';
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 1.7;
            ctx.beginPath();
            ctx.arc(point.x, point.y, size * 0.74, 0, TAU);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = style.color;
            ctx.font = `800 ${Math.max(9, size * 0.86)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(style.glyph, point.x, point.y + 0.5);
          },
        });
      }
    }

    drawEffects(ctx) {
      const basis = this.camera.basis;
      if (!basis) return;
      const { w, h } = this.view;
      const focal = this.focal();

      for (const tracer of this.tracers) {
        const seg = projectSegment(tracer.from, tracer.to, basis, focal, w, h);
        if (!seg) continue;
        const alpha = clamp(tracer.life / tracer.maxLife, 0, 1);
        ctx.strokeStyle = tracer.color;
        ctx.globalAlpha = alpha * 0.24;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(seg.ax, seg.ay);
        ctx.lineTo(seg.bx, seg.by);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.9;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(seg.ax, seg.ay);
        ctx.lineTo(seg.bx, seg.by);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      for (const particle of this.particles) {
        const point = projectPoint({ x: particle.x, y: particle.y, z: particle.z }, basis, focal, w, h);
        if (!point.visible || point.depth > 120) continue;
        const radius = clamp(point.scale * particle.size, 1, 9);
        ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      for (const floater of this.floaters) {
        const point = projectPoint({ x: floater.x, y: floater.y, z: floater.z }, basis, focal, w, h);
        if (!point.visible || point.depth > 90) continue;
        const alpha = clamp(floater.life / floater.maxLife, 0, 1);
        const size = clamp(26 - point.depth * 0.28, 10, 20);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = floater.color;
        ctx.font = `800 ${size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 4;
        ctx.fillText(floater.text, point.x, point.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      const player = this.player;
      if (player.alive) {
        for (const bot of this.bots) {
          if (!bot.alive) continue;
          const dist = distance(player.x, player.z, bot.x, bot.z);
          if (dist > 55) continue;
          const point = projectPoint({ x: bot.x, y: bot.y + 2.1, z: bot.z }, basis, focal, w, h);
          if (!point.visible || point.depth > 55) continue;
          if (!this.lineOfSight({ x: player.x, y: 1.5, z: player.z }, { x: bot.x, y: bot.y + 1.7, z: bot.z })) continue;
          const alpha = clamp(1 - (dist - 38) / 20, 0, 1);
          const barWidth = 42;
          const barHeight = 3.5;
          ctx.globalAlpha = alpha;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.font = '800 10px system-ui, sans-serif';
          ctx.fillStyle = bot.color;
          ctx.shadowColor = 'rgba(0,0,0,0.75)';
          ctx.shadowBlur = 4;
          ctx.fillText(bot.name, point.x, point.y - 3);
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.fillRect(point.x - barWidth / 2, point.y, barWidth, barHeight);
          ctx.fillStyle = bot.color;
          ctx.fillRect(point.x - barWidth / 2, point.y, barWidth * clamp(bot.hp / BATTLE.healthMax, 0, 1), barHeight);
          if (bot.shield > 0) {
            ctx.fillStyle = '#7cc8ff';
            ctx.fillRect(point.x - barWidth / 2, point.y - barHeight - 1, barWidth * clamp(bot.shield / BATTLE.shieldMax, 0, 1), 2);
          }
          ctx.globalAlpha = 1;
        }
      }
    }

    roundRect(ctx, x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    drawOverlay(ctx, w, h) {
      const player = this.player;
      const hp = Math.max(0, Math.min(BATTLE.healthMax, player.hp));
      const outside = Math.hypot(player.x, player.z) > this.currentStormRadius();

      if (outside && player.alive) {
        const pulse = 0.16 + Math.sin(this.clock * 5) * 0.05;
        const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.72);
        vignette.addColorStop(0, 'rgba(120, 60, 220, 0)');
        vignette.addColorStop(1, `rgba(130, 66, 230, ${pulse + 0.16})`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 13px system-ui, sans-serif';
        ctx.fillStyle = `rgba(255, 190, 210, ${0.72 + Math.sin(this.clock * 6) * 0.2})`;
        ctx.fillText(this.t('POZA STREFĄ', 'OUTSIDE THE STORM'), w / 2, 82);
      }

      if (this.damageFlash > 0) {
        const flash = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.22, w / 2, h / 2, Math.max(w, h) * 0.7);
        flash.addColorStop(0, 'rgba(255, 40, 70, 0)');
        flash.addColorStop(1, `rgba(255, 36, 74, ${this.damageFlash * 0.4})`);
        ctx.fillStyle = flash;
        ctx.fillRect(0, 0, w, h);
      } else if (player.alive && hp <= 30) {
        const low = 0.08 + Math.sin(this.clock * 5.5) * 0.04;
        const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.68);
        vignette.addColorStop(0, 'rgba(255, 30, 60, 0)');
        vignette.addColorStop(1, `rgba(255, 30, 60, ${low})`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
      }

      if (!player.alive) {
        ctx.fillStyle = 'rgba(38, 2, 10, 0.34)';
        ctx.fillRect(0, 0, w, h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 30px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 154, 172, 0.92)';
        ctx.fillText(this.t('Wyeliminowany', 'Eliminated'), w / 2, h / 2 - 40);
      }

      if (player.alive) {
        const cx = w / 2;
        const cy = h / 2;
        const moving = player.moveAmount > 0.12;
        const gap = 5 + player.spreadVisual * 12 + (moving ? 2.5 : 0) + (player.grounded ? 0 : 4);
        ctx.strokeStyle = this.hitMarker > 0 ? '#ff6b81' : 'rgba(236, 255, 246, 0.92)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - gap - 6, cy);
        ctx.lineTo(cx - gap, cy);
        ctx.moveTo(cx + gap, cy);
        ctx.lineTo(cx + gap + 6, cy);
        ctx.moveTo(cx, cy - gap - 6);
        ctx.lineTo(cx, cy - gap);
        ctx.moveTo(cx, cy + gap);
        ctx.lineTo(cx, cy + gap + 6);
        ctx.stroke();
        ctx.fillStyle = 'rgba(236, 255, 246, 0.95)';
        ctx.beginPath();
        ctx.arc(cx, cy, 1.4, 0, TAU);
        ctx.fill();
        if (this.hitMarker > 0) {
          ctx.strokeStyle = '#ff8296';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(cx - 10, cy - 10);
          ctx.lineTo(cx - 5, cy - 5);
          ctx.moveTo(cx + 10, cy - 10);
          ctx.lineTo(cx + 5, cy - 5);
          ctx.moveTo(cx - 10, cy + 10);
          ctx.lineTo(cx - 5, cy + 5);
          ctx.moveTo(cx + 10, cy + 10);
          ctx.lineTo(cx + 5, cy + 5);
          ctx.stroke();
        }

        if (player.reloadTimer > 0) {
          const weapon = WEAPONS[player.weapon] || WEAPONS.pistol;
          const progress = 1 - player.reloadTimer / (weapon.reload || 1);
          const width = 92;
          ctx.fillStyle = 'rgba(4, 10, 7, 0.66)';
          this.roundRect(ctx, cx - width / 2, cy + 26, width, 5, 3);
          ctx.fill();
          ctx.fillStyle = 'rgba(158, 247, 207, 0.9)';
          this.roundRect(ctx, cx - width / 2, cy + 26, width * clamp(progress, 0, 1), 5, 3);
          ctx.fill();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.font = '800 9px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(221, 255, 240, 0.8)';
          ctx.fillText(this.t('Przeładowanie…', 'Reloading…'), cx, cy + 36);
        }
      }

      let feedY = 86;
      for (const entry of this.killFeed) {
        const alpha = entry.age > 4.6 ? clamp(1 - (entry.age - 4.6) / 1.4, 0, 1) : 1;
        ctx.globalAlpha = alpha;
        ctx.font = '800 10.5px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const textWidth = ctx.measureText(entry.text).width;
        const boxWidth = textWidth + 18;
        const boxX = w - 22 - boxWidth;
        ctx.fillStyle = 'rgba(4, 10, 7, 0.62)';
        this.roundRect(ctx, boxX, feedY - 9, boxWidth, 19, 6);
        ctx.fill();
        ctx.fillStyle = entry.color;
        ctx.fillText(entry.text, boxX + 9, feedY + 0.5);
        feedY += 24;
        ctx.globalAlpha = 1;
      }

      const mapRadius = clamp(Math.min(w, h) * 0.085, 46, 64);
      const mapX = w - mapRadius - 22;
      const mapY = h - mapRadius - 22;
      const scale = mapRadius / this.arena.radius;
      ctx.save();
      ctx.beginPath();
      ctx.arc(mapX, mapY, mapRadius, 0, TAU);
      ctx.clip();
      const mapBg = ctx.createLinearGradient(0, mapY - mapRadius, 0, mapY + mapRadius);
      mapBg.addColorStop(0, 'rgba(16, 38, 32, 0.88)');
      mapBg.addColorStop(1, 'rgba(4, 11, 8, 0.88)');
      ctx.fillStyle = mapBg;
      ctx.fillRect(mapX - mapRadius, mapY - mapRadius, mapRadius * 2, mapRadius * 2);
      ctx.fillStyle = 'rgba(138, 188, 166, 0.3)';
      for (const box of this.buildings) {
        ctx.fillRect(
          mapX + box.x * scale - (box.w * scale) / 2,
          mapY + box.z * scale - (box.d * scale) / 2,
          Math.max(1.5, box.w * scale),
          Math.max(1.5, box.d * scale),
        );
      }
      ctx.strokeStyle = 'rgba(180, 120, 255, 0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(mapX, mapY, this.currentStormRadius() * scale, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      for (const chest of this.chests) {
        if (chest.opened) continue;
        ctx.fillRect(mapX + chest.x * scale - 1, mapY + chest.z * scale - 1, 2, 2);
      }
      ctx.fillStyle = '#ff6b81';
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const dist = distance(player.x, player.z, bot.x, bot.z);
        if (dist > 62) continue;
        ctx.beginPath();
        ctx.arc(mapX + bot.x * scale, mapY + bot.z * scale, 2.2, 0, TAU);
        ctx.fill();
      }
      if (player.alive) {
        const forward = { x: Math.sin(this.camera.yaw), z: Math.cos(this.camera.yaw) };
        const right = { x: Math.cos(this.camera.yaw), z: -Math.sin(this.camera.yaw) };
        ctx.fillStyle = '#3ee0a3';
        ctx.beginPath();
        ctx.moveTo(mapX + player.x * scale + forward.x * 7, mapY + player.z * scale + forward.z * 7);
        ctx.lineTo(mapX + player.x * scale - forward.x * 4 + right.x * 4, mapY + player.z * scale - forward.z * 4 + right.z * 4);
        ctx.lineTo(mapX + player.x * scale - forward.x * 4 - right.x * 4, mapY + player.z * scale - forward.z * 4 - right.z * 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(62, 224, 163, 0.32)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mapX, mapY, mapRadius, 0, TAU);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '900 9px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(221, 255, 240, 0.62)';
      ctx.fillText('N', mapX, mapY - mapRadius - 3);

      if (player.alive) {
        const chest = this.nearestChest();
        if (chest) {
          const label = this.t('E — otwórz skrzynię', 'E — open chest');
          ctx.font = '800 11px system-ui, sans-serif';
          const textWidth = ctx.measureText(label).width;
          const boxWidth = textWidth + 34;
          const boxX = w / 2 - boxWidth / 2;
          const boxY = h - 74;
          ctx.fillStyle = 'rgba(4, 10, 7, 0.72)';
          this.roundRect(ctx, boxX, boxY, boxWidth, 28, 8);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 209, 102, 0.5)';
          ctx.lineWidth = 1;
          this.roundRect(ctx, boxX, boxY, boxWidth, 28, 8);
          ctx.stroke();
          ctx.fillStyle = '#ffd166';
          this.roundRect(ctx, boxX + 7, boxY + 6, 17, 16, 4);
          ctx.fill();
          ctx.fillStyle = '#1a1405';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '900 9px system-ui, sans-serif';
          ctx.fillText('E', boxX + 15.5, boxY + 14.5);
          ctx.fillStyle = 'rgba(255, 244, 214, 0.94)';
          ctx.textAlign = 'left';
          ctx.font = '800 11px system-ui, sans-serif';
          ctx.fillText(label, boxX + 30, boxY + 14.5);
        }
      }

      if (this.running && !this.paused && !this.ended && !player.alive) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(221, 255, 240, 0.5)';
        ctx.fillText(this.t('Wracam do menu…', 'Returning to menu…'), w / 2, h - 104);
      }

      if (player.alive && !this.camera.locked && !this.pendingEnd) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.shadowColor = 'rgba(8, 26, 18, 0.7)';
        ctx.shadowBlur = 4;
        ctx.fillText(
          this.t('Kliknij, aby przejąć mysz · PPM — obrót kamery', 'Click to capture the mouse · RMB — rotate camera'),
          w / 2,
          h - 104,
        );
        ctx.shadowBlur = 0;
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = '700 9.5px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.76)';
      ctx.shadowColor = 'rgba(8, 26, 18, 0.7)';
      ctx.shadowBlur = 4;
      ctx.fillText(
        this.t(
          'WASD — ruch · Shift — sprint · Space — skok · E — skrzynia · R — przeładuj',
          'WASD — move · Shift — sprint · Space — jump · E — chest · R — reload',
        ),
        20,
        h - 14,
      );
      ctx.shadowBlur = 0;
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
    version: 2,
    catalog: CATALOG,
    weapons: WEAPONS,
    battleConfig: BATTLE,
    gameIds: Object.freeze(CATALOG.map((game) => game.id)),
    normalizeInstalled,
    stormRadius,
    normalizeAngle,
    makeCameraBasis,
    toCameraSpace,
    projectCameraSpace,
    projectPoint,
    projectSegment,
    raySphereHit,
    rayCylinderHit,
    rayAABBHit,
    rayBoxHit,
    hexToRgb,
    shadeColor,
    circleBoxHit,
    clipPolygonNear,
    createGame,
  });

  root.CHILL_MINIGAMES = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);