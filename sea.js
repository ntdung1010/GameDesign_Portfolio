/* =====================================================================
   SAIL THE ISLANDS: the second mini-game (boat, islands, sea life, boat race).
   Loaded the first time the Sail tab opens. It uses the page's globals:
   THREE, $, store, esc, GAMES, PROFILE, Sound, reduceMotion, isTouch,
   view, go, iconHTML, storeLabel, Sea.
   ===================================================================== */
window.initSea = function initSea() {
  "use strict";
  const T = THREE;
  const lin = (h) => new T.Color(h).convertSRGBToLinear();
  const raw = (h) => new T.Color(h);
  const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const canvas = $("sc"), host = $("seaApp");
  const LOW = isTouch || Math.min(screen.width, screen.height) < 820;

  /* ---------- renderer ---------- */
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const DPR_MAX = Math.min(devicePixelRatio, LOW ? 1.5 : 2);
  let dpr = DPR_MAX;
  renderer.setPixelRatio(dpr);
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(40, 1, 0.5, 1600);

  /* ---------- palettes: bright day (light theme) and golden dusk (dark theme) ---------- */
  const PAL = {
    day: { skyTop: 0x3f9fe6, skyLow: 0xd9f2fb, fog: 0xc9ebf7, deep: 0x0b66a3, shallow: 0x35d2c6, foam: 0xffffff, sun: 0xfff2d8,
      hemi: 0.6, key: 1.75, exposure: 1.0, sunDir: [0.45, 0.62, 0.35] },
    dusk: { skyTop: 0x24305c, skyLow: 0xf3a27a, fog: 0xdf9b82, deep: 0x10375f, shallow: 0x2a93a3, foam: 0xffe6d2, sun: 0xffb27a,
      hemi: 0.4, key: 1.25, exposure: 1.05, sunDir: [0.75, 0.22, 0.45] },
  };
  const isDark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  let P = isDark() ? PAL.dusk : PAL.day;
  const sunDir = new T.Vector3(...P.sunDir).normalize();
  const FOG_NEAR = 70, FOG_FAR = 330;
  scene.fog = new T.Fog(P.fog, FOG_NEAR, FOG_FAR); // r128 applies fog after encoding: raw sRGB value

  /* ---------- soft environment for reflections ---------- */
  (function env() {
    const e = new T.Scene();
    e.add(new T.Mesh(new T.SphereGeometry(50, 24, 12), new T.MeshBasicMaterial({ color: 0x9fc9e0, side: T.BackSide })));
    const panel = (w, h, x, y, z, c) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); e.add(m); };
    panel(46, 46, 0, 45, 0, 0xffffff); panel(30, 12, 40, 15, 20, 0xfff0d8);
    const g = new T.Mesh(new T.CircleGeometry(48, 24), new T.MeshBasicMaterial({ color: 0x2a7fa8 })); g.rotation.x = -Math.PI / 2; g.position.y = -8; e.add(g);
    const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(e, 0.04).texture; pm.dispose();
  })();
  const hemi = new T.HemisphereLight(0xffffff, 0x4d9fb8, P.hemi); scene.add(hemi);
  const key = new T.DirectionalLight(0xfff2de, P.key);
  key.castShadow = true;
  key.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 140 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04;
  scene.add(key, key.target);

  /* ---------- geometry + material helpers ---------- */
  function mat(color, o = {}) {
    const { physical = false, env = 1, ...rest } = o;
    const M = physical ? T.MeshPhysicalMaterial : T.MeshStandardMaterial;
    const m = new M(Object.assign({ roughness: 0.55, metalness: 0 }, rest));
    m.color = lin(color); m.envMapIntensity = env; return m;
  }
  function basic(color, o = {}) { const m = new T.MeshBasicMaterial(Object.assign({ toneMapped: false }, o)); m.color = lin(color); return m; }
  function mesh(geo, m, cast = true, recv = false) { const o = new T.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = recv; return o; }
  function roundedBox(w, h, d, r) {
    r = Math.min(r, w / 2, h / 2, d / 2);
    const g = new T.SphereGeometry(r, 20, 13, Math.PI / 20), p = g.attributes.position;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x + Math.sign(x) * hx, y + Math.sign(y) * hy, z + Math.sign(z) * hz); }
    g.computeBoundingSphere(); return g;
  }
  const H = Math.PI / 2;
  function arc(cx, cy, r, a0, a1, n = 8) { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
  function lathe(pts, seg = 48) { return new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(Math.max(x, 0), y)), seg); }
  function rockGeo(seed = 1, sq = 0.7) {
    const g = new T.SphereGeometry(1, 30, 22), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.14 * Math.sin(x * 3.1 + seed + z * 1.7) + 0.09 * Math.cos(y * 4.3 + x * 2.2 + seed * 2) + 0.05 * Math.sin(z * 6 + seed);
      p.setXYZ(i, x * n, y * n * sq, z * n);
    }
    g.computeVertexNormals(); return g;
  }
  function merge(list) {
    const pos = [], nor = [];
    list.forEach(({ geo, m }) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); });
    const out = new T.BufferGeometry();
    out.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    return out;
  }
  function bake(root) { // merge static meshes per material, like the truck map does
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), done = [];
    root.traverse(o => {
      if (!o.isMesh || o === root) return;
      const m = o.material;
      if (Array.isArray(m) || m.map || m.transparent || o.renderOrder || o.userData.keep || m.vertexColors) return;
      if (!buckets.has(m)) buckets.set(m, { list: [], cast: false, recv: false });
      const b = buckets.get(m); b.list.push({ geo: o.geometry, m: new T.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
      b.cast = b.cast || o.castShadow; b.recv = b.recv || o.receiveShadow; done.push(o);
    });
    done.forEach(o => o.parent.remove(o));
    buckets.forEach((b, m) => { const mm = new T.Mesh(merge(b.list), m); mm.castShadow = b.cast; mm.receiveShadow = b.recv; root.add(mm); });
  }
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c); t.anisotropy = MAX_ANISO; if (srgb) t.encoding = T.sRGBEncoding; return t;
  }
  const stripes = (cols, n, vertical = true) => canvasTex(256, 256, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; if (vertical) g.fillRect(i * w / n, 0, w / n + 1, h); else g.fillRect(0, i * h / n, w, h / n + 1); } });
  const textTex = (str, { w = 512, h = 160, bg = "rgba(0,0,0,0)", fg = "#ffffff", font = "800 96px Unbounded, Arial Black, sans-serif" } = {}) =>
    canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.font = font; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = fg; g.fillText(str, w / 2, h / 2 + 6); });

  /* ---------- waves: the same function runs in the water shader and in JS (for bobbing) ---------- */
  const WAVE_GLSL = `float wave(vec2 p, float t) {
    return sin(p.x * 0.12 + t * 1.1) * 0.34 + sin(p.y * 0.15 - t * 0.9) * 0.28
         + sin((p.x + p.y) * 0.25 + t * 1.7) * 0.12 + sin((p.x * 0.6 - p.y * 0.4) + t * 2.3) * 0.05; }`;
  const waveH = (x, z, t) => Math.sin(x * 0.12 + t * 1.1) * 0.34 + Math.sin(z * 0.15 - t * 0.9) * 0.28
    + Math.sin((x + z) * 0.25 + t * 1.7) * 0.12 + Math.sin((x * 0.6 - z * 0.4) + t * 2.3) * 0.05;

  /* ---------- world layout ---------- */
  const gameById = (id) => GAMES.find(g => g.id === id);
  // R is the island's build radius; S scales the whole island down so it sits in proportion to the boat
  const ISLANDS = [
    { key: "dock", name: "Home Dock", about: true, pos: [0, 2], R: 7, S: 0.72, dir: [0, 1], labelY: 7 },
    { key: "chaos", name: "Potion Isle", game: gameById("chaos"), pos: [36, -24], R: 11, S: 0.62, dir: [-1, 0.25], labelY: 11 },
    { key: "birdy", name: "Nest Cliffs", game: gameById("birdy"), pos: [-34, -50], R: 10, S: 0.62, dir: [1, 0.2], labelY: 16 },
    { key: "water", name: "Crystal Lagoon", game: gameById("water"), pos: [30, -82], R: 14, S: 0.6, dir: [-1, 0.2], labelY: 11 },
    { key: "skewer", name: "BBQ Beach", game: gameById("skewer"), pos: [-37, -108], R: 13, S: 0.6, dir: [1, 0.2], labelY: 10 },
    { key: "mob", name: "Moving Day Harbor", game: gameById("mob"), pos: [22, -136], R: 11, S: 0.62, dir: [-1, 0.2], labelY: 11 },
    { key: "hatch", name: "Hatchery Atoll", game: gameById("hatch"), pos: [-20, -164], R: 9, S: 0.72, dir: [1, 0.2], labelY: 17 },
  ].filter(s => s.about || s.game);
  ISLANDS.forEach(s => { s.Re = s.R * s.S; const L = Math.hypot(...s.dir); s.ring = [s.pos[0] + s.dir[0] / L * (s.Re + 5.5), s.pos[1] + s.dir[1] / L * (s.Re + 5.5)]; });
  const RACE = { pos: [74, 14], cps: [[78, -24], [104, -50], [122, -88], [106, -124], [78, -132], [62, -100], [68, -60], [74, 6]] };
  const WORLD = { cx: 25, cz: -72, r: 220 };
  const RING_R = 3.8;

  /* ---------- sky ---------- */
  const skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: raw(P.skyTop) }, uLow: { value: raw(P.skyLow) }, uSunCol: { value: raw(P.sun) }, uSun: { value: sunDir } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uTop, uLow, uSunCol, uSun; varying vec3 vDir;
      void main() { vec3 d = normalize(vDir); float h = clamp(d.y * 1.5 + 0.08, 0.0, 1.0);
        vec3 c = mix(uLow, uTop, pow(h, 0.65)); float s = max(dot(d, normalize(uSun)), 0.0);
        c += uSunCol * (pow(s, 900.0) * 1.4 + pow(s, 14.0) * 0.28);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(1200, 32, 16), skyMat); sky.renderOrder = -2; scene.add(sky);
  const cloudM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.35, envMapIntensity: 0.6 });
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const c = new T.Group(), n = 4 + (i % 3);
    for (let k = 0; k < n; k++) { const b = new T.Mesh(new T.SphereGeometry(1, 20, 14), cloudM); const r = 2.6 + Math.sin(i * 3 + k) * 1.2; b.scale.set(r * 1.3, r * 0.8, r); b.position.set((k - n / 2) * 2.6, Math.sin(k * 1.7) * 0.8, Math.cos(k * 2.3 + i) * 1.4); c.add(b); }
    c.position.set(-120 + (i * 47) % 260, 42 + (i % 4) * 6, 40 - i * 21); scene.add(c); clouds.push(c);
  }

  /* ---------- sea floor (sand with moving caustics, seen through the water) ---------- */
  const floorMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSand: { value: raw(0xe9d3a3) }, uDeep: { value: raw(P.deep) }, uFog: { value: raw(P.fog) }, uNear: { value: FOG_NEAR }, uFar: { value: FOG_FAR } },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uNear, uFar; uniform vec3 uSand, uDeep, uFog; varying vec3 vW;
      void main() { vec2 p = vW.xz * 0.32; float c = sin(p.x * 1.7 + uTime * 0.9 + sin(p.y * 1.3 + uTime * 0.6)) + sin(p.y * 1.9 - uTime * 0.8 + sin(p.x * 1.1 - uTime * 0.5));
        c = pow(abs(c) * 0.5, 5.0); vec3 col = mix(uDeep, uSand, 0.26) + c * 0.2;
        float f = smoothstep(uNear, uFar, length(cameraPosition - vW)); gl_FragColor = vec4(mix(col, uFog, f), 1.0); }`,
  });
  const floor = new T.Mesh(new T.PlaneGeometry(900, 900, 1, 1).rotateX(-Math.PI / 2), floorMat);
  floor.position.y = -8; scene.add(floor);

  /* ---------- water ---------- */
  const islandUniform = [];
  for (let i = 0; i < 8; i++) islandUniform.push(new T.Vector4(0, 0, 0, 0));
  ISLANDS.forEach((s, i) => islandUniform[i].set(s.pos[0], s.pos[1], s.Re, s.Re * 0.9 + 4));
  const waterMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uDeep: { value: raw(P.deep) }, uShallow: { value: raw(P.shallow) }, uFoam: { value: raw(P.foam) }, uSky: { value: raw(P.skyLow) },
      uSunCol: { value: raw(P.sun) }, uSun: { value: sunDir }, uFog: { value: raw(P.fog) }, uNear: { value: FOG_NEAR }, uFar: { value: FOG_FAR }, uIsl: { value: islandUniform },
    },
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vH; ${WAVE_GLSL}
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); float h = wave(w.xz, uTime); w.y += h; vH = h; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uNear, uFar; uniform vec3 uDeep, uShallow, uFoam, uSky, uSunCol, uSun, uFog; uniform vec4 uIsl[8];
      varying vec3 vW; varying float vH; ${WAVE_GLSL}
      void main() {
        float e = 0.6;
        float hx = wave(vW.xz + vec2(e, 0.0), uTime) - wave(vW.xz - vec2(e, 0.0), uTime);
        float hz = wave(vW.xz + vec2(0.0, e), uTime) - wave(vW.xz - vec2(0.0, e), uTime);
        vec3 n = normalize(vec3(-hx, 2.0 * e, -hz));
        n = normalize(n + vec3(sin(vW.x * 1.7 + uTime * 2.1), 0.0, cos(vW.z * 1.9 - uTime * 1.8)) * 0.04);
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        float shore = 1000.0, shallow = 0.0;
        for (int i = 0; i < 8; i++) { vec4 s = uIsl[i]; if (s.z > 0.0) { float d = length(vW.xz - s.xy) - s.z; shore = min(shore, d); shallow = max(shallow, 1.0 - smoothstep(0.0, s.w, d)); } }
        float tint = 0.93 + 0.07 * sin(vW.x * 0.035 + uTime * 0.05) * sin(vW.z * 0.03 - uTime * 0.04);
        vec3 col = mix(uDeep * tint, uShallow, pow(shallow, 1.25) * 0.95 + 0.04);
        col = mix(col, uSky, fres * 0.5);
        vec3 hv = normalize(normalize(uSun) + v);
        float nh = max(dot(n, hv), 0.0);
        col += uSunCol * (pow(nh, 280.0) * 1.9 + pow(nh, 36.0) * 0.1);
        float wob = sin(vW.x * 0.35 + vW.z * 0.28 + uTime * 1.3) * 0.16;
        float f1 = 1.0 - smoothstep(0.0, 0.5, abs(shore - 0.3 - wob));
        float f2 = (1.0 - smoothstep(0.0, 0.32, abs(shore - 0.8 - mod(uTime * 0.7, 2.4)))) * (1.0 - smoothstep(0.6, 3.2, shore)) * 0.65;
        float foam = (f1 + f2) * step(shore, 5.0);
        foam += smoothstep(0.5, 0.74, vH) * 0.2;
        col = mix(col, uFoam, clamp(foam, 0.0, 0.92));
        float a = mix(0.78, 0.95, fres) - shallow * 0.3 + foam * 0.3;
        float f = smoothstep(uNear, uFar, length(cameraPosition - vW));
        gl_FragColor = vec4(mix(col, uFog, f), clamp(mix(a, 1.0, f), 0.0, 1.0));
      }`,
  });
  const WSEG = LOW ? 150 : 210, WSIZE = 620, WSTEP = WSIZE / WSEG;
  const water = new T.Mesh(new T.PlaneGeometry(WSIZE, WSIZE, WSEG, WSEG).rotateX(-Math.PI / 2), waterMat);
  water.renderOrder = 5; water.frustumCulled = false; scene.add(water);

  /* =====================================================================
     ISLANDS
     ===================================================================== */
  const sandM = mat(0xf0d9a6, { roughness: 0.95, env: 0.4 });
  const woodM = mat(0x9a6b43, { roughness: 0.8 }), woodDark = mat(0x6e4a2e, { roughness: 0.85 });
  const leafM = mat(0x3fae5a, { roughness: 0.6 }), leafM2 = mat(0x5cc46a, { roughness: 0.6 });
  const rockM = mat(0x9aa3a6, { roughness: 0.8 }), whiteM = mat(0xf6f6f2, { roughness: 0.45 });
  const glassM = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.25, depthWrite: false, side: T.DoubleSide, envMapIntensity: 1.8 });
  const obstacles = [];   // { x, z, r }
  const animated = [];    // functions (t, dt)

  // Island terrain: a polar grid with a wavy coastline, grassy hills easing into a beach, wet sand at
  // the waterline and a sandy shelf under the water. Vertex colours blend sand -> grass smoothly.
  const smooth = (e0, e1, x) => { const k = clampN((x - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); };
  function base(s, sand = sandM, grass = null, grassR = 0, opts = {}) {
    const g = new T.Group(), R = s.R, RMAX = R * 1.6, RINGS = LOW ? 34 : 48, SEG = LOW ? 96 : 128, Lf = opts.lagoon || 0;
    const ph = [(R * 1.37 + s.pos[0] * 0.11) % 6.283, (R * 2.11 + s.pos[1] * 0.07) % 6.283, (R * 0.73 + 1) % 6.283];
    const outline = (a) => 1 + 0.08 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]) + 0.025 * Math.sin(9 * a + ph[2]);
    const heightAt = (r, a) => {
      const t = r / (R * outline(a));
      if (t >= 1) return -7 * smooth(1, 1.55, t);
      const hill = 1 - smooth(0.56, 0.84, t), beach = 1 - smooth(0.82, 1.0, t);
      let y = 0.4 * beach + 0.62 * hill + hill * 0.09 * (Math.sin(a * 4 + r * 0.6 + ph[1]) + Math.sin(a * 7 - r * 0.9 + ph[2]) * 0.6);
      if (Lf) y = lerp(y, -2.6, 1 - smooth(Lf - 0.1, Lf + 0.1, t));
      return y;
    };
    s.gy = (x, z) => heightAt(Math.hypot(x, z), Math.atan2(z, x));
    const sandC = sand.color.clone(), wet = sandC.clone().multiplyScalar(0.72), under = sandC.clone().lerp(lin(0x2a8f9a), 0.4);
    const grassC = grass ? grass.color.clone() : sandC.clone(), grassDark = grassC.clone().multiplyScalar(0.78);
    const colorAt = (y, a, r) => {
      let c;
      if (y < -0.05) c = under.clone().lerp(sandC, clampN((y + 2.5) / 2.5, 0, 1) * 0.6);
      else if (y < 0.18) c = wet.clone().lerp(sandC, y / 0.18);
      else c = sandC.clone();
      if (grass) { const k = smooth(0.6, 0.78, y); if (k > 0) c.lerp(grassC.clone().lerp(grassDark, 0.5 + 0.5 * Math.sin(a * 6 + r * 0.8)), k); }
      return c;
    };
    const pos = [0, heightAt(0, 0), 0], col = [], idx = [];
    const c0 = colorAt(pos[1], 0, 0); col.push(c0.r, c0.g, c0.b);
    for (let i = 1; i <= RINGS; i++) {
      const r = RMAX * i / RINGS;
      for (let j = 0; j < SEG; j++) { const a = j / SEG * Math.PI * 2, y = heightAt(r, a), c = colorAt(y, a, r); pos.push(Math.cos(a) * r, y, Math.sin(a) * r); col.push(c.r, c.g, c.b); }
    }
    const V = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * SEG + (j % SEG));
    for (let j = 0; j < SEG; j++) idx.push(0, V(1, j + 1), V(1, j));
    for (let i = 1; i < RINGS; i++) for (let j = 0; j < SEG; j++) { const a0 = V(i, j), b0 = V(i, j + 1), c1 = V(i + 1, j), d1 = V(i + 1, j + 1); idx.push(a0, b0, c1, b0, d1, c1); }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    g.add(mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.4 }), false, true));
    if (grass) { // bushes and flowers, only where the ground is grassy
      let sd = s.R * 7.3 + s.pos[0];
      const rnd = () => ((sd = (sd * 16807 + 11) % 2147483647) / 2147483647);
      const bushM = [mat(0x3f9a55, { roughness: 0.7 }), mat(0x58b766, { roughness: 0.7 }), mat(0x2f7f48, { roughness: 0.7 })];
      const petal = [0xffffff, 0xffd84a, 0xff8fb8, 0xb69cff, 0xff7a3d].map(c => mat(c, { roughness: 0.5 }));
      const bushGeo = new T.SphereGeometry(1, 24, 16), flowerGeo = new T.SphereGeometry(0.15, 12, 8), stemGeo = new T.CylinderGeometry(0.022, 0.022, 0.26, 5);
      for (let n = 0, tries = 0; n < 11 && tries < 90; tries++) {
        const a = rnd() * 6.283, r = grassR * (0.3 + rnd() * 0.65), x = Math.cos(a) * r, z = Math.sin(a) * r, y = s.gy(x, z);
        if (y < 0.66) continue;
        const sc = 0.4 + rnd() * 0.45, b = mesh(bushGeo, bushM[n % 3]); b.scale.set(sc * 1.25, sc * 0.85, sc * 1.25); b.position.set(x, y + sc * 0.3, z); g.add(b); n++;
      }
      for (let n = 0, tries = 0; n < 18 && tries < 120; tries++) {
        const a = rnd() * 6.283, r = grassR * (0.2 + rnd() * 0.75), x = Math.cos(a) * r, z = Math.sin(a) * r, y = s.gy(x, z);
        if (y < 0.66) continue;
        const f = mesh(flowerGeo, petal[n % petal.length], false); f.position.set(x, y + 0.25, z); g.add(f);
        const st = mesh(stemGeo, bushM[1], false); st.position.set(x, y + 0.11, z); g.add(st); n++;
      }
    }
    return g;
  }
  const FROND = (() => { // a tapered leaf that droops and folds along its midrib
    const g = new T.PlaneGeometry(1, 1, 2, 14), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), v = p.getY(i) + 0.5;
      const w = 0.38 * Math.pow(Math.sin(Math.PI * Math.min(v * 1.06, 1)), 0.65) * (1 - v * 0.2), xx = x * 2 * w;
      p.setXYZ(i, xx, -v * v * 1.0 - Math.abs(xx) * 0.4, v * 2.6);
    }
    g.computeVertexNormals(); return g;
  })();
  const frondM = [mat(0x3aa957, { roughness: 0.55, side: T.DoubleSide }), mat(0x5cc66b, { roughness: 0.55, side: T.DoubleSide })];
  const trunkGeo = new T.CylinderGeometry(1, 1, 1, 14), trunkRing = mat(0xb58456, { roughness: 0.85 });
  function palm(h = 5, lean = 0.3) {
    const g = new T.Group(); let x = 0, y = 0;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const k = i / n, ang = lean * k * 1.5, len = h / n + 0.05, r = 0.24 - i * 0.012;
      const seg = mesh(trunkGeo, i % 2 ? woodM : trunkRing); seg.scale.set(r * (i % 2 ? 1 : 1.08), len, r * (i % 2 ? 1 : 1.08));
      seg.position.set(x + Math.sin(ang) * len / 2, y + Math.cos(ang) * len / 2, 0); seg.rotation.z = -ang; g.add(seg);
      x += Math.sin(ang) * len; y += Math.cos(ang) * len;
    }
    const top = new T.Group(); top.position.set(x, y, 0); g.add(top);
    for (let i = 0; i < 9; i++) {
      const arm = new T.Group(); arm.rotation.y = i / 9 * Math.PI * 2 + 0.2;
      const leaf = mesh(FROND, frondM[i % 2]); leaf.rotation.x = -0.5 + (i % 3) * 0.18; arm.add(leaf); top.add(arm);
    }
    for (let i = 0; i < 3; i++) { const c = mesh(new T.SphereGeometry(0.19, 16, 12), woodDark); c.position.set(Math.cos(i * 2.1) * 0.24, -0.22, Math.sin(i * 2.1) * 0.24); top.add(c); }
    return g;
  }
  function roundTree(s = 1, col = leafM) {
    const g = new T.Group();
    const tr = mesh(new T.CylinderGeometry(0.2, 0.32, 2.2, 14), woodM); tr.position.y = 1.1; g.add(tr);
    [[0, 2.9, 0, 1.35, col], [0.8, 2.5, 0.4, 0.95, leafM2], [-0.7, 2.6, -0.3, 1.0, col], [0.1, 3.7, -0.1, 0.9, leafM2], [0.4, 3.2, -0.6, 0.75, col]].forEach(([x, y, z, r, m]) => { const b = mesh(new T.SphereGeometry(r, 30, 22), m); b.position.set(x, y, z); g.add(b); });
    g.scale.setScalar(s); return g;
  }
  function rock(x, y, z, s, m = rockM, seed = 1, sq = 0.7) { const r = mesh(rockGeo(seed, sq), m, true, true); r.position.set(x, y, z); r.scale.setScalar(s); r.rotation.y = seed; return r; }
  function bird(col, s = 1) {
    const g = new T.Group(), m = mat(col, { roughness: 0.45 });
    const b = mesh(new T.SphereGeometry(0.5, 28, 20), m); b.scale.set(1, 0.92, 1.1); b.position.y = 0.5;
    const hd = mesh(new T.SphereGeometry(0.33, 24, 18), m); hd.position.set(0, 1.0, -0.2);
    const bk = mesh(new T.ConeGeometry(0.1, 0.24, 10), mat(0xffa531)); bk.rotation.x = -Math.PI / 2; bk.position.set(0, 0.98, -0.56);
    const eyeM = mat(0x15181c);
    [-0.13, 0.13].forEach(x => { const e = mesh(new T.SphereGeometry(0.06, 8, 6), eyeM, false); e.position.set(x, 1.08, -0.47); g.add(e); });
    g.add(b, hd, bk); g.scale.setScalar(s); return g;
  }
  function signBoard(s, iconUrl) { // the game's store icon on a little post, on the beach facing the ring
    const g = new T.Group();
    const post = mesh(new T.CylinderGeometry(0.07, 0.09, 1.9, 10), woodM); post.position.y = 0.95; g.add(post);
    const frame = mesh(roundedBox(1.8, 1.8, 0.16, 0.32), whiteM); frame.position.y = 2.2; g.add(frame);
    new T.TextureLoader().load(iconUrl, (tex) => {
      tex.encoding = T.sRGBEncoding; tex.anisotropy = MAX_ANISO;
      const face = new T.Mesh(new T.PlaneGeometry(1.6, 1.6), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
      face.position.set(0, 2.2, 0.09); g.add(face);
    });
    const dx = s.ring[0] - s.pos[0], dz = s.ring[1] - s.pos[1], d = Math.hypot(dx, dz), side = [-dz / d, dx / d];
    g.position.set(s.pos[0] + dx / d * (s.Re - 0.6) + side[0] * 2.4, 0.15, s.pos[1] + dz / d * (s.Re - 0.6) + side[1] * 2.4);
    g.rotation.y = Math.atan2(dx, dz);
    return g;
  }

  const BUILD = {
    dock(s, st, an) {
      st.add(base(s, sandM, mat(0x6fc06e, { roughness: 0.8 }), s.R - 2.2));
      const t1 = roundTree(0.8); t1.position.set(-2.5, 1, -1.5); st.add(t1);
      st.add(rock(3.2, 0.9, -2.5, 1.1, rockM, 2));
      // wooden pier out to the ring
      for (let i = 0; i < 9; i++) { const pl = mesh(roundedBox(2.4, 0.16, 0.9, 0.05), woodM, true, true); pl.position.set(0, 0.95, s.R - 1 + i * 0.95); st.add(pl); }
      [-1.1, 1.1].forEach(x => [0, 4, 8].forEach(z => { const p = mesh(new T.CylinderGeometry(0.13, 0.13, 2.4, 8), woodDark); p.position.set(x, 0.1, s.R - 0.6 + z); st.add(p); }));
      // About sign and a flag
      const post = mesh(new T.CylinderGeometry(0.1, 0.1, 2.6, 8), woodDark); post.position.set(2.4, 2.2, 1.5); st.add(post);
      const board = new T.Mesh(roundedBox(2.8, 1.0, 0.14, 0.12), whiteM); board.position.set(2.4, 3.2, 1.5); board.castShadow = true; st.add(board);
      const txt = new T.Mesh(new T.PlaneGeometry(2.6, 0.82), new T.MeshBasicMaterial({ map: textTex("ABOUT ME", { fg: "#16242a", font: "800 86px Unbounded, Arial Black, sans-serif" }), transparent: true, toneMapped: false }));
      txt.position.set(2.4, 3.2, 1.58); an.add(txt);
      const pole = mesh(new T.CylinderGeometry(0.07, 0.07, 6, 8), whiteM); pole.position.set(-1.5, 4, 2); st.add(pole);
      const flag = mesh(new T.PlaneGeometry(1.8, 1.1, 10, 1), basic(0xff5d3a, { side: T.DoubleSide }), false); flag.position.set(-0.6, 6.4, 2); flag.userData.keep = true; an.add(flag);
      const fp = flag.geometry.attributes.position, base0 = fp.array.slice();
      animated.push((t) => { for (let i = 0; i < fp.count; i++) { const x = base0[i * 3]; fp.setZ(i, Math.sin(x * 3 + t * 6) * 0.12 * (x + 0.9)); } fp.needsUpdate = true; });
    },
    chaos(s, st, an) { // Potion Isle: purple sand, glowing potion flasks, pumpkins, bats
      st.add(base(s, mat(0xcdb6dc, { roughness: 0.95, env: 0.4 }), mat(0x5d3f86, { roughness: 0.85 }), s.R - 2.5));
      const prock = mat(0x5a4a6e, { roughness: 0.8 });
      [[-5, -3, 1.8, 1], [5.5, -4, 1.4, 2], [-6, 3, 1.1, 3]].forEach(([x, z, sc, sd]) => st.add(rock(x, 1.3, z, sc, prock, sd)));
      const flask = (col, x, z, sc) => {
        const g = new T.Group();
        const liquid = new T.MeshStandardMaterial({ color: lin(col), emissive: lin(col), emissiveIntensity: 0.9, roughness: 0.2 });
        const gl = new T.Mesh(new T.SphereGeometry(1, 32, 20), glassM); gl.position.y = 1; gl.renderOrder = 2;
        const liq = mesh(new T.SphereGeometry(0.86, 28, 18, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), liquid); liq.position.y = 1;
        const top = mesh(new T.CircleGeometry(Math.sin(Math.PI * 0.35) * 0.86, 28), liquid); top.rotation.x = -Math.PI / 2; top.position.y = 1 + Math.cos(Math.PI * 0.35) * 0.86;
        const neck = new T.Mesh(new T.CylinderGeometry(0.3, 0.36, 1.1, 24, 1, true), glassM); neck.position.y = 2.4; neck.renderOrder = 2;
        const cork = mesh(new T.CylinderGeometry(0.26, 0.22, 0.4, 16), woodM); cork.position.y = 3.05;
        g.add(gl, liq, top, neck, cork); g.position.set(x, 0.9, z); g.scale.setScalar(sc); return g;
      };
      an.add(flask(0x9b4dff, -1.2, -1, 1.6), flask(0xff8a1f, 2.4, 0.6, 1.25), flask(0x7bd23c, 0.4, 2.8, 1.0));
      const pumpkin = (x, z, sc) => { const g = new T.Group(), m = mat(0xff8a1f, { roughness: 0.45, physical: true, clearcoat: 0.4 });
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, l = mesh(new T.SphereGeometry(0.42, 24, 16), m); l.scale.set(0.62, 0.78, 1); l.position.set(Math.cos(a) * 0.22, 0.4, Math.sin(a) * 0.22); l.rotation.y = -a; g.add(l); }
        const st2 = mesh(new T.CylinderGeometry(0.06, 0.09, 0.3, 8), mat(0x4f7a2c)); st2.position.y = 0.82; g.add(st2); g.position.set(x, 1.0, z); g.scale.setScalar(sc); return g; };
      [[4, 3.5, 1.4], [-4, 4.5, 1.1], [5.5, -1, 1.0], [-3, -5.5, 1.2]].forEach(([x, z, sc]) => st.add(pumpkin(x, z, sc)));
      // a crooked dead tree
      const dt = mat(0x3b2d3f, { roughness: 0.9 });
      [[0, 1.8, 0, 0.25, 0.32, 3.6, 0, 0.15], [0.6, 3.6, 0, 0.12, 0.18, 1.8, 0, -0.8], [-0.5, 3.4, 0.2, 0.1, 0.16, 1.6, 0.3, 0.9]].forEach(([x, y, z, r1, r2, h, rx, rz]) => { const b = mesh(new T.CylinderGeometry(r1, r2, h, 8), dt); b.position.set(x - 5, y + 1, z + 0.5); b.rotation.set(rx, 0, rz); st.add(b); });
      // bats circling
      const batM = mat(0x221a2b, { roughness: 0.7 });
      for (let i = 0; i < 6; i++) {
        const bat = new T.Group(), body = mesh(new T.SphereGeometry(0.22, 10, 8), batM, false); bat.add(body);
        const wings = [-1, 1].map(sd => { const w = mesh(new T.PlaneGeometry(0.8, 0.4), new T.MeshStandardMaterial({ color: lin(0x221a2b), side: T.DoubleSide }), false); w.position.x = sd * 0.42; bat.add(w); return w; });
        an.add(bat);
        const r = 5 + i * 0.9, h = 6 + (i % 3), sp = 0.8 + i * 0.12, ph = i;
        animated.push((t) => { const a = t * sp + ph; bat.position.set(Math.cos(a) * r, h + Math.sin(t * 2 + i) * 0.6, Math.sin(a) * r); bat.rotation.y = -a; const f = Math.sin(t * 16 + i) * 0.8; wings[0].rotation.z = f; wings[1].rotation.z = -f; });
      }
    },
    birdy(s, st, an) { // Nest Cliffs: a tall cliff, a big tree, nests full of birds
      st.add(base(s, sandM, mat(0x67b85e, { roughness: 0.8 }), s.R - 2));
      const cliffM = mat(0xa58f78, { roughness: 0.85 });
      st.add(rock(0, 3, 0, 4.8, cliffM, 4, 1.0), rock(1.2, 7.2, -0.4, 3.6, cliffM, 5, 0.95), rock(-0.6, 10.2, 0.3, 2.6, cliffM, 6, 0.8));
      const cap = mesh(new T.SphereGeometry(2.6, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), mat(0x67b85e, { roughness: 0.8 })); cap.position.set(-0.4, 10.6, 0.3); st.add(cap);
      const tree = roundTree(1.2); tree.position.set(-0.5, 11.2, 0.2); st.add(tree);
      const nestM = mat(0x8a5a3b, { roughness: 0.9 });
      [[3.6, 5.2, 1.8, 0x3f8fe8], [-3.8, 3.6, 2.2, 0xf04a4a], [2.4, 8.6, 2.0, 0xffc93a]].forEach(([x, y, z, c]) => {
        const n = mesh(new T.TorusGeometry(0.75, 0.3, 14, 36), nestM); n.rotation.x = Math.PI / 2; n.position.set(x, y, z); st.add(n);
        const b = bird(c, 0.9); b.position.set(x, y - 0.1, z); b.rotation.y = Math.atan2(x, z) + Math.PI; an.add(b);
      });
      [[-6, 4], [6, 3.5], [5, -5]].forEach(([x, z], i) => { const p = palm(4.5, 0.25 + i * 0.05); p.position.set(x, 0.9, z); p.rotation.y = i * 2; st.add(p); });
    },
    water(s, st, an) { // Crystal Lagoon: ring island, waterfall, giant glass tubes, jellyfish
      const R = s.R, Rin = R - 6;
      st.add(base(s, sandM, mat(0x6fc06e, { roughness: 0.8 }), R - 1.5, { lagoon: (Rin + 1.2) / R }));
      const cliffM = mat(0x8fa0a8, { roughness: 0.8 });
      const tx = 0, tz = -(R - 3);
      st.add(rock(tx, 2.5, tz, 3.2, cliffM, 7, 1.1), rock(tx + 0.6, 5.6, tz - 0.3, 2.2, cliffM, 8, 1.0));
      const fallMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv; void main() { float s = sin(vUv.y * 22.0 + uTime * 7.0 + sin(vUv.x * 13.0) * 1.4);
          vec3 c = mix(vec3(0.62, 0.9, 1.0), vec3(1.0), smoothstep(0.2, 1.0, s)); float a = (0.6 + 0.3 * s) * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          gl_FragColor = vec4(c, a); }` });
      const fall = new T.Mesh(new T.PlaneGeometry(2.4, 6.8), fallMat); fall.position.set(tx, 3.8, tz + 2.4); fall.rotation.x = -0.18; fall.renderOrder = 6; an.add(fall);
      animated.push((t) => { fallMat.uniforms.uTime.value = t; });
      const tubeCols = [[0x2fb6e8, 0xff5fa2], [0xffd84a, 0x7b6cf6], [0xff5fa2, 0x2fb6e8], [0x7b6cf6, 0xffd84a], [0x5bcf7a, 0xff8a1f]];
      tubeCols.forEach(([c1, c2], i) => {
        const a = Math.PI * 0.25 + i * 0.32, rr = (R + Rin) / 2;
        const g = new T.Group();
        const gl = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 4.2, 24, 1, true), glassM); gl.position.y = 2.1; gl.renderOrder = 2;
        [[c1, 0.9], [c2, 2.5]].forEach(([c, y]) => { const l = mesh(new T.CylinderGeometry(0.48, 0.48, 1.6, 20), new T.MeshStandardMaterial({ color: lin(c), emissive: lin(c), emissiveIntensity: 0.35, roughness: 0.15 })); l.position.y = y; g.add(l); });
        const lip = mesh(new T.TorusGeometry(0.58, 0.07, 8, 24), whiteM); lip.rotation.x = Math.PI / 2; lip.position.y = 4.2;
        g.add(gl, lip); g.position.set(Math.cos(a) * rr, 0.6, Math.sin(a) * rr); g.rotation.set(0.25 * Math.sin(i * 3), 0, 0.3 * Math.cos(i * 2)); an.add(g);
      });
      [[-R + 3, 2], [R - 3, -3], [-2, R - 3]].forEach(([x, z], i) => { const p = palm(5, 0.3); p.position.set(x, 0.9, z); p.rotation.y = i * 1.7; st.add(p); });
      // jellyfish drifting in the lagoon
      for (let i = 0; i < 6; i++) {
        const jm = new T.MeshStandardMaterial({ color: lin(i % 2 ? 0xff8fd0 : 0xb79cff), emissive: lin(i % 2 ? 0xff5fb8 : 0x9b7bff), emissiveIntensity: 0.6, transparent: true, opacity: 0.75, roughness: 0.3 });
        const j = new T.Group(), bell = new T.Mesh(new T.SphereGeometry(0.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), jm); j.add(bell);
        for (let k = 0; k < 5; k++) { const tn = new T.Mesh(new T.CylinderGeometry(0.03, 0.01, 1.2, 4), jm); tn.position.set(Math.cos(k * 1.25) * 0.3, -0.6, Math.sin(k * 1.25) * 0.3); j.add(tn); }
        an.add(j);
        const a0 = i * 1.05, rr = 2 + (i % 3) * 1.6;
        animated.push((t) => { const a = a0 + t * 0.12; j.position.set(Math.cos(a) * rr, -1.1 + Math.sin(t * 1.3 + i) * 0.35, Math.sin(a) * rr); bell.scale.set(1 + Math.sin(t * 3 + i) * 0.08, 1 - Math.sin(t * 3 + i) * 0.1, 1 + Math.sin(t * 3 + i) * 0.08); });
      }
    },
    skewer(s, st, an) { // BBQ Beach: palms, umbrella, grill with smoke, a giant skewer
      st.add(base(s, mat(0xf6e0ac, { roughness: 0.95, env: 0.4 }), mat(0x77c46e, { roughness: 0.8 }), s.R - 6));
      [[-6, -4, 6, 0.35], [-3, -7, 5, 0.2], [5, -6, 5.5, 0.4], [7, 2, 4.5, 0.3]].forEach(([x, z, h, l], i) => { const p = palm(h, l); p.position.set(x, 0.9, z); p.rotation.y = i * 1.4 + 0.5; st.add(p); });
      const umb = new T.Mesh(new T.ConeGeometry(2.6, 1.0, 16, 1, true), new T.MeshStandardMaterial({ map: stripes(["#ff5d3a", "#ffffff"], 8), side: T.DoubleSide, roughness: 0.6 }));
      umb.position.set(2, 3.4, 3); umb.castShadow = true; an.add(umb);
      const upole = mesh(new T.CylinderGeometry(0.06, 0.06, 3.2, 8), whiteM); upole.position.set(2, 1.9, 3); st.add(upole);
      const towel = mesh(roundedBox(1.2, 0.04, 2.4, 0.02), mat(0x3fb8f0)); towel.position.set(3.6, 0.92, 4.2); towel.rotation.y = 0.3; st.add(towel);
      const grillM = mat(0x2f3439, { roughness: 0.4, metalness: 0.5 });
      const grill = mesh(roundedBox(2.2, 0.7, 1.2, 0.18), grillM); grill.position.set(-2, 1.9, 2); st.add(grill);
      [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]].forEach(([x, z]) => { const l = mesh(new T.CylinderGeometry(0.06, 0.06, 1.1, 8), grillM); l.position.set(-2 + x, 1.1, 2 + z); st.add(l); });
      const ember = mesh(roundedBox(2.0, 0.05, 1.0, 0.02), new T.MeshStandardMaterial({ color: lin(0xff5a1f), emissive: lin(0xff4a10), emissiveIntensity: 1.5 })); ember.position.set(-2, 2.27, 2); st.add(ember);
      const smokeM = new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
      const puffs = [];
      for (let i = 0; i < 12; i++) { const pf = new T.Mesh(new T.SphereGeometry(0.4, 10, 8), smokeM.clone()); pf.renderOrder = 3; an.add(pf); puffs.push({ m: pf, o: i / 12 }); }
      animated.push((t) => puffs.forEach(p => { const k = (t * 0.25 + p.o) % 1; p.m.position.set(-2 + Math.sin(k * 6 + p.o * 9) * 0.5, 2.5 + k * 5, 2 + k * 1.5); p.m.scale.setScalar(0.5 + k * 1.8); p.m.material.opacity = 0.45 * (1 - k); }));
      // giant skewer stuck in the sand
      const stick = mesh(new T.CylinderGeometry(0.09, 0.09, 7, 8), mat(0xe8cf9f)); stick.position.set(5, 3.6, -1); stick.rotation.z = 0.25; st.add(stick);
      [[0xa0522d, 0], [0xe8412f, 1], [0x5bbf3a, 0], [0xffc23a, 2], [0xa0522d, 0]].forEach(([c, kind], i) => {
        const geo = kind === 1 ? new T.SphereGeometry(0.55, 18, 14) : kind === 2 ? new T.CylinderGeometry(0.42, 0.42, 0.6, 18) : roundedBox(0.95, 0.85, 0.85, 0.2);
        const f = mesh(geo, mat(c, { roughness: 0.5 })); const y = 2 + i * 1.05; f.position.set(5 - Math.sin(0.25) * (y - 3.6), y, -1); f.rotation.set(i, i * 0.7, 0.25); st.add(f);
      });
      [[-5, 5], [-7, 1]].forEach(([x, z]) => { const ch = mesh(roundedBox(1.0, 0.1, 2.0, 0.04), mat(0xffc93a)); ch.position.set(x, 1.15, z); ch.rotation.set(-0.35, 0.6, 0); st.add(ch); });
    },
    mob(s, st, an) { // Moving Day Harbor: pier, little house, crane, piles of moving boxes
      st.add(base(s, sandM, mat(0x71bf6c, { roughness: 0.8 }), s.R - 2.2));
      const dx = s.ring[0] - s.pos[0], dz = s.ring[1] - s.pos[1], ang = Math.atan2(dx, dz);
      const pier = new T.Group(); pier.rotation.y = ang;
      for (let i = 0; i < 8; i++) { const pl = mesh(roundedBox(3.2, 0.16, 0.9, 0.05), woodM, true, true); pl.position.set(0, 1.0, s.R - 2 + i * 0.95); pier.add(pl); }
      st.add(pier);
      const house = new T.Group();
      const walls = mesh(roundedBox(4.2, 2.8, 3.4, 0.12), mat(0x5aa9e6, { roughness: 0.6 }), true, true); walls.position.y = 2.4;
      const roof = mesh(new T.CylinderGeometry(0.01, 3.4, 2.0, 4, 1), mat(0xe8574a, { roughness: 0.6 })); roof.position.y = 4.8; roof.rotation.y = Math.PI / 4; roof.scale.set(1.25, 1, 1.0);
      const door = mesh(roundedBox(0.9, 1.6, 0.1, 0.05), mat(0xffffff)); door.position.set(0, 1.85, 1.72);
      const winM = basic(0xffe9a8); [-1.3, 1.3].forEach(x => { const w = mesh(roundedBox(0.8, 0.7, 0.06, 0.04), winM, false); w.position.set(x, 2.6, 1.72); house.add(w); });
      house.add(walls, roof, door); house.position.set(-2.8, 0.3, -2.2); house.rotation.y = ang; st.add(house);
      const card = mat(0xe6c79a, { roughness: 0.85 }), tape = mat(0xd8b37a, { roughness: 0.4 });
      const box = (x, y, z, sc, r) => { const g = new T.Group(); const b = mesh(roundedBox(1.2, 1.0, 1.2, 0.06), card); const tp = mesh(roundedBox(0.25, 1.02, 1.22, 0.02), tape, false); g.add(b, tp); g.position.set(x, y, z); g.scale.setScalar(sc); g.rotation.y = r; return g; };
      [[3, 1.5, 1, 1, 0.2], [4.2, 1.5, 1.4, 1, -0.3], [3.6, 2.5, 1.2, 0.9, 0.6], [2.2, 1.5, 3.2, 1.1, 0.1], [4.8, 1.5, -1.2, 0.9, 0.4], [5.2, 2.4, -1.0, 0.8, -0.2]].forEach(a => st.add(box(...a)));
      // crane with a swinging box
      const craneM = mat(0xffc93a, { roughness: 0.5, metalness: 0.2 });
      const mast = mesh(roundedBox(0.4, 7, 0.4, 0.08), craneM); mast.position.set(-5, 4.4, 2.5); st.add(mast);
      const arm = mesh(roundedBox(6, 0.35, 0.35, 0.08), craneM); arm.position.set(-2.4, 7.8, 2.5); st.add(arm);
      const swing = new T.Group(); swing.position.set(0.2, 7.6, 2.5); an.add(swing);
      const cable = mesh(new T.CylinderGeometry(0.03, 0.03, 3, 6), mat(0x333333), false); cable.position.y = -1.5; swing.add(cable);
      const hb = box(0, -3.4, 0, 1, 0); swing.add(hb);
      animated.push((t) => { swing.rotation.z = Math.sin(t * 1.1) * 0.12; swing.rotation.x = Math.sin(t * 0.8) * 0.06; });
      const t1 = roundTree(0.9); t1.position.set(-6, 0.9, -4); st.add(t1);
      [[1.2, 0.2], [-1.6, 0.5]].forEach(([x, z]) => { const bar = mesh(new T.CylinderGeometry(0.4, 0.4, 0.9, 14), mat(0x3d7bf2)); bar.position.set(x + 4, 1.4, z - 4); st.add(bar); });
    },
    hatch(s, st, an) { // Hatchery Atoll: lighthouse with a sweeping beam, giant eggs in nests
      st.add(base(s, sandM, mat(0x7fcb73, { roughness: 0.8 }), s.R - 2));
      const towerTex = stripes(["#f4f4f0", "#e8402f"], 6, false);
      const tower = mesh(new T.CylinderGeometry(1.0, 1.55, 8, 32, 1, true), new T.MeshStandardMaterial({ map: towerTex, roughness: 0.5 })); tower.position.set(-2.5, 4.9, -2); an.add(tower);
      const towerCap = mesh(new T.CylinderGeometry(1.0, 1.0, 0.1, 32), whiteM); towerCap.position.set(-2.5, 0.95, -2); st.add(towerCap);
      const gallery = mesh(new T.CylinderGeometry(1.5, 1.5, 0.22, 32), mat(0x2f3439)); gallery.position.set(-2.5, 9.0, -2); st.add(gallery);
      const lamp = mesh(new T.CylinderGeometry(0.75, 0.75, 1.2, 20), new T.MeshStandardMaterial({ color: lin(0xfff3b0), emissive: lin(0xffe27a), emissiveIntensity: 1.6 })); lamp.position.set(-2.5, 9.7, -2); st.add(lamp);
      const roofC = mesh(new T.ConeGeometry(1.0, 1.0, 20), mat(0xe8402f)); roofC.position.set(-2.5, 10.8, -2); st.add(roofC);
      const beamPivot = new T.Group(); beamPivot.position.set(-2.5, 9.7, -2); an.add(beamPivot);
      const beam = new T.Mesh(new T.ConeGeometry(2.6, 22, 20, 1, true), new T.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
      beam.rotation.z = Math.PI / 2; beam.position.x = 11; beam.renderOrder = 7; beamPivot.add(beam);
      animated.push((t) => { beamPivot.rotation.y = t * 0.9; });
      const straw = mat(0xe3c06a, { roughness: 0.9 });
      [[2.5, 2.2, 0x5cbf3a], [3.5, -1.5, 0xff7eb0], [0, 3.8, 0xe8402f]].forEach(([x, z, c], i) => {
        const n = mesh(new T.TorusGeometry(1.0, 0.4, 16, 40), straw); n.rotation.x = Math.PI / 2; n.position.set(x, 1.3, z); st.add(n);
        const egg = mesh(new T.SphereGeometry(0.75, 24, 18), mat(c, { roughness: 0.3, physical: true, clearcoat: 0.6 })); egg.scale.y = 1.3; egg.position.set(x, 1.95, z); egg.userData.keep = true; an.add(egg);
        animated.push((t) => { egg.rotation.z = Math.sin(t * 3 + i * 2) * (Math.sin(t * 0.7 + i) > 0.6 ? 0.18 : 0.02); });
      });
      const chick = bird(0xffc93a, 0.7); chick.position.set(1.2, 1.0, 0.6); an.add(chick);
      [[5, -4], [-5.5, 3]].forEach(([x, z], i) => { const p = palm(4.6, 0.3); p.position.set(x, 0.9, z); p.rotation.y = i * 2.2; st.add(p); });
    },
  };

  ISLANDS.forEach((s) => {
    const root = new T.Group(); root.position.set(s.pos[0], 0, s.pos[1]); root.scale.setScalar(s.S); scene.add(root);
    const st = new T.Group(), an = new T.Group(); root.add(st, an);
    BUILD[s.key](s, st, an);
    bake(st);
    if (s.game && s.game.icon) scene.add(signBoard(s, s.game.icon));
    obstacles.push({ x: s.pos[0], z: s.pos[1], r: s.Re + 0.4, island: true });
    // visit ring: floating orange ring with little buoys
    const ring = new T.Group(); ring.position.set(s.ring[0], 0, s.ring[1]); scene.add(ring);
    const ringMat = basic(0xff7a3d, { transparent: true, opacity: 0.9 });
    const torus = new T.Mesh(new T.TorusGeometry(RING_R, 0.16, 8, 64), ringMat); torus.rotation.x = Math.PI / 2; torus.position.y = 0.15; ring.add(torus);
    const buoyM = mat(0xff7a3d, { roughness: 0.4, physical: true, clearcoat: 0.6 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, b = mesh(new T.SphereGeometry(0.32, 14, 10), i % 2 ? buoyM : whiteM, false); b.position.set(Math.cos(a) * RING_R, 0.15, Math.sin(a) * RING_R); ring.add(b); }
    Object.assign(s, { ringObj: ring, ringMat, buoyM, visited: false, labelPos: new T.Vector3(s.pos[0], s.labelY * s.S + 2, s.pos[1]) });
  });

  /* ---------- race pontoon (start/finish) ---------- */
  const raceStart = new T.Group(); raceStart.position.set(RACE.pos[0], 0, RACE.pos[1]); scene.add(raceStart);
  (function buildPontoon() {
    const deck = mesh(roundedBox(9, 0.4, 5, 0.12), woodM, true, true); deck.position.y = 0.45; raceStart.add(deck);
    [-4, 4].forEach(x => { const f = mesh(new T.CylinderGeometry(0.6, 0.6, 5, 16), mat(0xf2f2f2)); f.rotation.x = Math.PI / 2; f.position.set(x, 0.1, 0); raceStart.add(f); });
    const checker = canvasTex(256, 64, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? "#16242a" : "#ffffff"; g.fillRect(i * 16, j * 16, 16, 16); } });
    [-3.6, 3.6].forEach(x => { const p = mesh(new T.CylinderGeometry(0.14, 0.14, 5, 10), mat(0x16242a)); p.position.set(x, 3, 0); raceStart.add(p); });
    const banner = new T.Mesh(new T.PlaneGeometry(7.2, 1.4), new T.MeshStandardMaterial({ map: checker, side: T.DoubleSide })); banner.position.set(0, 5.2, 0); raceStart.add(banner);
    const label = new T.Mesh(new T.PlaneGeometry(4.6, 1.1), new T.MeshBasicMaterial({ map: textTex("RACE", { bg: "#ff5d3a" }), toneMapped: false, side: T.DoubleSide })); label.position.set(0, 3.8, 0.02); raceStart.add(label);
  })();
  const raceZone = { x: RACE.pos[0], z: RACE.pos[1] + 5.5, r: 4.2 };
  const raceZoneRing = new T.Mesh(new T.TorusGeometry(raceZone.r, 0.16, 8, 64), basic(0xffffff, { transparent: true, opacity: 0.9 }));
  raceZoneRing.rotation.x = Math.PI / 2; raceZoneRing.position.set(raceZone.x, 0.15, raceZone.z); scene.add(raceZoneRing);
  obstacles.push({ x: RACE.pos[0] - 3, z: RACE.pos[1], r: 2.8 }, { x: RACE.pos[0] + 3, z: RACE.pos[1], r: 2.8 });
  // race checkpoint gates (vertical rings), shown only while racing
  const cpGates = RACE.cps.map((c, i) => {
    const nx = RACE.cps[(i + 1) % RACE.cps.length], pv = RACE.cps[(i - 1 + RACE.cps.length) % RACE.cps.length];
    const g = new T.Group(); g.position.set(c[0], 0, c[1]); g.rotation.y = Math.atan2(nx[0] - pv[0], nx[1] - pv[1]);
    const m = basic(0xffd23f, { transparent: true, opacity: 0.85 });
    const ringV = new T.Mesh(new T.TorusGeometry(4.6, 0.32, 12, 56), m); ringV.position.y = 2.6; g.add(ringV);
    [-4.6, 4.6].forEach(x => { const b = mesh(new T.SphereGeometry(0.55, 14, 10), mat(0xffd23f, { roughness: 0.4 }), false); b.position.set(x, 0.2, 0); g.add(b); });
    g.visible = false; scene.add(g); return { g, m, ring: ringV };
  });

  /* =====================================================================
     BOATS
     ===================================================================== */
  /* Speedboat: lofted hull (sharp entry, V bottom, flat transom) with painted waterline stripes,
     teak deck, wraparound windshield, helm seats, stern bench, bow pad, chrome rub rail and bow rail. */
  const HL = 4.6;
  const uOf = (z) => (z + HL / 2) / HL; // 0 at the bow, 1 at the transom
  const half = (z) => 1.0 * Math.pow(Math.sin(Math.min(uOf(z) * 1.45, 1) * H), 0.72);
  const deckAt = (z) => 0.5 + Math.pow(1 - uOf(z), 2) * 0.42;
  const keelAt = (z) => -0.5 + Math.pow(1 - uOf(z), 2.6) * 0.85;
  const sectionY = (top, keel, a) => keel + (top - keel) * (0.42 * a + 0.58 * Math.pow(a, 5));
  const chrome = mat(0xe8edf2, { metalness: 1, roughness: 0.16, env: 1.7 });
  const vinyl = mat(0xf5f3ee, { roughness: 0.45, physical: true, clearcoat: 0.3 });
  const darkTrim = mat(0x1d2329, { roughness: 0.4 });
  const teak = canvasTex(256, 256, (g, w, h) => {
    const cols = ["#c98f58", "#bd844f", "#cf9862", "#c28a53", "#cb935b"];
    for (let i = 0; i < 5; i++) { g.fillStyle = cols[i]; g.fillRect(i * w / 5, 0, w / 5, h); g.fillStyle = "#3d2a1b"; g.fillRect(i * w / 5, 0, 3, h); }
    for (let k = 0; k < 60; k++) { g.fillStyle = "rgba(80,50,28,.10)"; g.fillRect(Math.random() * w, Math.random() * h, 1, 20 + Math.random() * 70); }
  });
  teak.wrapS = teak.wrapT = T.RepeatWrapping; teak.repeat.set(1.25, 0.5);
  function hullGeometry(accent) {
    const N = 44, M = 28, pos = [], col = [], idx = [];
    const ac = lin(accent), navy = lin(0x10243d), white = lin(0xf7f7f4);
    const paint = (y) => { const c = y < -0.06 ? navy : y < 0.07 ? ac : (y > 0.28 && y < 0.34) ? navy : white; return [c.r, c.g, c.b]; };
    for (let i = 0; i <= N; i++) {
      const z = -HL / 2 + HL * i / N, hw = Math.max(half(z), 0.012), top = deckAt(z), keel = keelAt(z);
      for (let k = 0; k <= M; k++) {
        const tau = -1 + 2 * k / M, a = Math.sin(Math.abs(tau) * H), x = hw * a * Math.sign(tau), y = sectionY(top, keel, a);
        pos.push(x, y, z); col.push(...paint(y));
      }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) { const a0 = i * (M + 1) + k, b0 = a0 + M + 1; idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1); }
    const c0 = pos.length / 3, zs = HL / 2; pos.push(0, (deckAt(zs) + keelAt(zs)) / 2, zs); col.push(...paint(0.2));
    for (let k = 0; k < M; k++) idx.push(c0, N * (M + 1) + k, N * (M + 1) + k + 1);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const DECK_Y = 0.52;
  function deckGeometry() { // teak deck cut to the hull's inside at deck height
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const z = -1.55 + (HL / 2 - 0.08 + 1.55) * i / 26, top = deckAt(z), keel = keelAt(z);
      let lo = 0, hi = 1; for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (sectionY(top, keel, mid) < DECK_Y) lo = mid; else hi = mid; }
      pts.push([half(z) * lo * 0.97, z]);
    }
    const sh = new T.Shape(); sh.moveTo(-pts[0][0], -pts[0][1]); pts.forEach(([x, z]) => sh.lineTo(-x, -z)); pts.slice().reverse().forEach(([x, z]) => sh.lineTo(x, -z));
    const geo = new T.ShapeGeometry(sh, 1).rotateX(-Math.PI / 2); geo.translate(0, DECK_Y, 0); return geo;
  }
  function gunwaleCurve(inset, lift, z0, z1) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const z = z0 + (z1 - z0) * i / 24; pts.push(new T.Vector3(-(half(z) - inset), deckAt(z) + lift, z)); }
    for (let i = 24; i >= 0; i--) { const z = z0 + (z1 - z0) * i / 24; pts.push(new T.Vector3(half(z) - inset, deckAt(z) + lift, z)); }
    return new T.CatmullRomCurve3(pts);
  }
  const DECK = deckGeometry();
  const RUB = new T.TubeGeometry(gunwaleCurve(-0.01, 0.0, HL / 2 - 0.04, -HL / 2 + 0.06), 180, 0.045, 8, false);
  const BOWRAIL = new T.TubeGeometry(gunwaleCurve(0.13, 0.34, -0.25, -HL / 2 + 0.42), 120, 0.024, 6, false);
  function makeBoat(accent = 0xff5d3a) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const add = (geo, m, x, y, z, cast = true) => { const o = mesh(geo, m, cast); o.position.set(x, y, z); body.add(o); return o; };
    const hullM = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25, side: T.DoubleSide });
    body.add(mesh(hullGeometry(accent), hullM));
    add(DECK, new T.MeshStandardMaterial({ map: teak, roughness: 0.62, side: T.DoubleSide }), 0, 0, 0, false).receiveShadow = true;
    add(RUB, chrome, 0, 0, 0, false);
    add(BOWRAIL, chrome, 0, 0, 0, false);
    [-0.35, -0.85, -1.35].forEach(z => [-1, 1].forEach(sd => { const x = sd * (half(z) - 0.13), y0 = deckAt(z); add(new T.CylinderGeometry(0.02, 0.02, 0.34, 6), chrome, x, y0 + 0.17, z, false); }));
    const accentM = mat(accent, { roughness: 0.35, physical: true, clearcoat: 1 });
    // helm console, dash, wheel, gauges
    add(roundedBox(0.8, 0.66, 0.62, 0.22), vinyl, 0, DECK_Y + 0.33, -0.15);
    const dash = add(roundedBox(0.72, 0.06, 0.42, 0.03), darkTrim, 0, DECK_Y + 0.68, -0.2, false); dash.rotation.x = -0.4;
    const wheel = add(new T.TorusGeometry(0.15, 0.025, 10, 28), darkTrim, -0.16, DECK_Y + 0.78, 0.06, false); wheel.rotation.x = -0.9;
    [0.1, 0.24].forEach(x => { const gz = add(new T.CylinderGeometry(0.05, 0.05, 0.02, 16), basic(0xbfe6ff), x, DECK_Y + 0.71, -0.24, false); gz.rotation.x = 1.17; });
    // wraparound windshield with a chrome top frame
    const glass = new T.Mesh(new T.CylinderGeometry(0.95, 0.95, 0.38, 36, 1, true, Math.PI - 1.15, 2.3),
      new T.MeshPhysicalMaterial({ color: lin(0x8fcbe0), roughness: 0.04, transparent: true, opacity: 0.38, clearcoat: 1, side: T.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }));
    glass.position.set(0, DECK_Y + 0.84, 0.4); glass.renderOrder = 3; body.add(glass);
    const frameCurve = new T.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) => { const th = Math.PI - 1.15 + 2.3 * i / 16; return new T.Vector3(0.95 * Math.sin(th), DECK_Y + 1.03, 0.4 + 0.95 * Math.cos(th)); }));
    add(new T.TubeGeometry(frameCurve, 48, 0.02, 6, false), chrome, 0, 0, 0, false);
    // helm seats with accent piping
    [-0.33, 0.33].forEach(x => {
      add(roundedBox(0.48, 0.3, 0.46, 0.13), vinyl, x, DECK_Y + 0.2, 0.62);
      const back = add(roundedBox(0.46, 0.5, 0.14, 0.07), vinyl, x, DECK_Y + 0.55, 0.86); back.rotation.x = 0.18;
      add(roundedBox(0.5, 0.035, 0.48, 0.015), accentM, x, DECK_Y + 0.36, 0.62, false);
    });
    // stern bench, bow sun pad
    add(roundedBox(1.55, 0.32, 0.5, 0.14), vinyl, 0, DECK_Y + 0.18, 1.85);
    const bb = add(roundedBox(1.5, 0.32, 0.13, 0.06), vinyl, 0, DECK_Y + 0.46, 2.12); bb.rotation.x = 0.12;
    add(roundedBox(1.56, 0.035, 0.52, 0.015), accentM, 0, DECK_Y + 0.335, 1.85, false);
    add(roundedBox(0.9, 0.12, 0.85, 0.06), mat(0xf0e6d6, { roughness: 0.6 }), 0, DECK_Y + 0.1, -1.05);
    // outboard motor: rounded cowling with an accent band
    const cowl = add(new T.SphereGeometry(1, 28, 20), vinyl, 0, 0.98, 2.47); cowl.scale.set(0.3, 0.36, 0.36);
    const band = add(new T.CylinderGeometry(0.305, 0.305, 0.08, 28, 1, true), accentM, 0, 0.86, 2.47, false); band.scale.z = 1.2;
    add(roundedBox(0.4, 0.32, 0.48, 0.14), darkTrim, 0, 0.68, 2.47);
    add(roundedBox(0.13, 0.85, 0.24, 0.05), darkTrim, 0, 0.12, 2.52);
    const prop = new T.Group(); prop.position.set(0, -0.32, 2.66); body.add(prop);
    for (let i = 0; i < 3; i++) { const b = mesh(roundedBox(0.07, 0.3, 0.1, 0.03), chrome, false); b.rotation.z = i * 2.094; b.position.set(Math.sin(i * 2.094) * 0.11, Math.cos(i * 2.094) * 0.11, 0); prop.add(b); }
    // stern light pole with a small flag, bow nav lights
    add(new T.CylinderGeometry(0.02, 0.02, 1.0, 6), chrome, 0.62, deckAt(2.1) + 0.5, 2.1, false);
    add(new T.SphereGeometry(0.05, 10, 8), basic(0xffffff), 0.62, deckAt(2.1) + 1.02, 2.1, false);
    const flag = mesh(new T.PlaneGeometry(0.46, 0.28, 6, 1), basic(accent, { side: T.DoubleSide }), false); flag.position.set(0.62, deckAt(2.1) + 0.84, 2.35); flag.rotation.y = Math.PI / 2; body.add(flag);
    [[-1, 0xe8402f], [1, 0x3fd06a]].forEach(([sd, c]) => add(new T.SphereGeometry(0.045, 10, 8), basic(c), sd * (half(-1.7) + 0.01), deckAt(-1.7) + 0.02, -1.7, false));
    return { g, body, prop, flag };
  }
  const player = makeBoat(0xff5d3a, 0x16324a); scene.add(player.g);
  const rivals = [makeBoat(0x3fb8f0, 0x2a2f34), makeBoat(0xffc93a, 0x6a2b8a)];
  rivals.forEach(r => scene.add(r.g));

  /* =====================================================================
     SEA LIFE
     ===================================================================== */
  const dummy = new T.Object3D();
  // Fish schools: instanced, each school circles an island just under the surface
  const FISH_PER = LOW ? 22 : 34;
  const fishGeo = merge([
    { geo: new T.SphereGeometry(0.5, 10, 8), m: new T.Matrix4().makeScale(0.24, 0.34, 0.85) },
    { geo: new T.ConeGeometry(0.3, 0.5, 6), m: new T.Matrix4().compose(new T.Vector3(0, 0, 0.6), new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0)), new T.Vector3(0.35, 1, 1)) },
  ]);
  const schoolsDef = [[1, 0.16, -1.4], [3, -0.12, -1.6], [4, 0.14, -1.3], [2, -0.15, -1.5], [6, 0.13, -1.4]].slice(0, LOW ? 3 : 5);
  const fishCount = schoolsDef.length * FISH_PER;
  const fish = new T.InstancedMesh(fishGeo, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 }), fishCount);
  const FISH_COLS = [0xffb03a, 0x3fb8f0, 0xff6f91, 0xffe14a, 0x6be3c4, 0xb69cff];
  const fishData = [];
  schoolsDef.forEach(([iIdx, sp, depth], k) => {
    const s = ISLANDS[Math.min(iIdx, ISLANDS.length - 1)];
    for (let j = 0; j < FISH_PER; j++) {
      fishData.push({ s, sp, depth, k, r: 0.8 + Math.random() * 3.2, ph: Math.random() * 6.28, vy: Math.random() * 6.28, f: 0.8 + Math.random() * 0.6, col: FISH_COLS[(k + (j % 3)) % FISH_COLS.length], sz: 0.8 + Math.random() * 0.5 });
      fish.setColorAt(fishData.length - 1, lin(FISH_COLS[(k * 2 + (j % 2)) % FISH_COLS.length]));
    }
  });
  fish.frustumCulled = false; scene.add(fish);
  function updateFish(t) {
    fishData.forEach((d, i) => {
      const R = d.s.Re + 8 + d.k * 1.2, a = t * d.sp + d.k * 1.7;
      const cx = d.s.pos[0] + Math.cos(a) * R, cz = d.s.pos[1] + Math.sin(a) * R;
      const tx = -Math.sin(a) * Math.sign(d.sp), tz = Math.cos(a) * Math.sign(d.sp);
      const la = d.ph + t * 1.1 * d.f;
      dummy.position.set(cx + Math.cos(la) * d.r, d.depth + Math.sin(t * 1.7 + d.vy) * 0.35, cz + Math.sin(la) * d.r);
      dummy.rotation.set(0, Math.atan2(-tx, -tz) + Math.sin(t * 9 + d.ph) * 0.18, 0);
      dummy.scale.setScalar(d.sz); dummy.updateMatrix(); fish.setMatrixAt(i, dummy.matrix);
    });
    fish.instanceMatrix.needsUpdate = true;
  }
  // Turtles
  const turtles = [];
  for (let i = 0; i < (LOW ? 3 : 5); i++) {
    const g = new T.Group();
    const shell = mesh(new T.SphereGeometry(0.9, 30, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5b8a3a, { roughness: 0.5, physical: true, clearcoat: 0.4 }), false); shell.scale.set(1, 0.6, 1.2);
    const belly = mesh(new T.CylinderGeometry(0.88, 0.88, 0.12, 20), mat(0xe6d29a), false); belly.scale.set(1, 1, 1.2);
    const skin = mat(0x8bbf6a, { roughness: 0.6 });
    const head = mesh(new T.SphereGeometry(0.32, 14, 10), skin, false); head.position.set(0, 0.05, -1.3);
    const flips = [[-0.9, -0.5], [0.9, -0.5], [-0.7, 0.8], [0.7, 0.8]].map(([x, z], k) => { const f = mesh(roundedBox(0.9, 0.08, 0.36, 0.04), skin, false); f.position.set(x, 0, z); g.add(f); return f; });
    g.add(shell, belly, head); scene.add(g);
    const s = ISLANDS[1 + (i % (ISLANDS.length - 1))];
    turtles.push({ g, flips, s, r: s.Re + 6 + i * 1.5, sp: 0.05 + i * 0.012, ph: i * 1.9, depth: -1.1 - (i % 2) * 0.4 });
  }
  // Dolphins that leap out of the water
  function dolphinModel() {
    const g = new T.Group(), m = mat(0x6f8fa8, { roughness: 0.35, physical: true, clearcoat: 0.8 }), belly = mat(0xd9e4ea, { roughness: 0.4 });
    const b = mesh(new T.SphereGeometry(0.5, 30, 20), m); b.scale.set(0.9, 0.85, 3.1);
    const bl = mesh(new T.SphereGeometry(0.46, 18, 12), belly); bl.scale.set(0.8, 0.6, 2.6); bl.position.y = -0.12;
    const snout = mesh(new T.ConeGeometry(0.16, 0.6, 12), m); snout.rotation.x = -Math.PI / 2; snout.position.z = -1.75;
    const fin = mesh(new T.ConeGeometry(0.22, 0.6, 3), m); fin.scale.set(0.3, 1, 1.2); fin.position.set(0, 0.55, 0.15); fin.rotation.x = 0.4;
    const tail = mesh(roundedBox(1.1, 0.06, 0.4, 0.03), m); tail.position.z = 1.62;
    [-1, 1].forEach(sd => { const p = mesh(roundedBox(0.6, 0.05, 0.25, 0.02), m); p.position.set(sd * 0.48, -0.15, -0.5); p.rotation.z = sd * 0.4; g.add(p); });
    g.add(b, bl, snout, fin, tail); g.rotation.order = "YXZ"; return g;
  }
  const dolphins = [[10, -38, 13, 0.24, 0], [-4, -95, 14, -0.22, 3], [2, -150, 12, 0.25, 6]].map(([cx, cz, r, sp, ph], i) => { const g = dolphinModel(); scene.add(g); return { g, cx, cz, r, sp, ph, period: 6 + i * 1.3, lastK: 0 }; });
  // A slow whale out in deeper water
  const whale = (() => {
    const g = new T.Group(), m = mat(0x2e4d6e, { roughness: 0.45, physical: true, clearcoat: 0.5 }), belly = mat(0xc9d8e2, { roughness: 0.5 });
    const b = mesh(new T.SphereGeometry(1, 28, 18), m, false); b.scale.set(2.3, 1.7, 6.8);
    const bl = mesh(new T.SphereGeometry(1, 24, 14), belly, false); bl.scale.set(2.0, 1.2, 5.8); bl.position.y = -0.6;
    const tail = mesh(roundedBox(4.6, 0.25, 1.4, 0.12), m, false); tail.position.set(0, 0.2, 7.2);
    [-1, 1].forEach(sd => { const f = mesh(roundedBox(2.4, 0.18, 0.9, 0.09), m, false); f.position.set(sd * 2.2, -0.6, -1.5); f.rotation.set(0, sd * 0.4, sd * 0.4); g.add(f); });
    g.add(b, bl, tail); g.rotation.order = "YXZ"; scene.add(g); return { g, tail };
  })();
  // Manta rays gliding
  const rays = [];
  for (let i = 0; i < 3; i++) {
    const g = new T.Group(), m = mat(0x3a4a5e, { roughness: 0.5 });
    const body = mesh(new T.SphereGeometry(0.6, 14, 8), m, false); body.scale.set(1, 0.25, 1.4); g.add(body);
    const wings = [-1, 1].map(sd => { const pv = new T.Group(); pv.position.x = sd * 0.4; const w = mesh(new T.ConeGeometry(0.8, 2.2, 3), m, false); w.rotation.z = -sd * Math.PI / 2; w.scale.set(1, 1, 0.12); w.position.x = sd * 1.0; pv.add(w); g.add(pv); return pv; });
    const tl = mesh(new T.CylinderGeometry(0.03, 0.01, 2, 4), m, false); tl.rotation.x = Math.PI / 2; tl.position.z = 1.8; g.add(tl);
    scene.add(g); rays.push({ g, wings, cx: [-8, 14, -22][i], cz: [-66, -118, -140][i], r: 10 + i * 3, sp: 0.1 + i * 0.03, ph: i * 2 });
  }
  // Seagulls over the islands
  const gulls = [];
  for (let i = 0; i < (LOW ? 5 : 9); i++) {
    const g = new T.Group(), m = mat(0xffffff, { roughness: 0.6 }), wingM = new T.MeshStandardMaterial({ color: lin(0xf2f4f5), side: T.DoubleSide });
    const b = mesh(new T.SphereGeometry(0.25, 10, 8), m, false); b.scale.set(0.8, 0.8, 1.8); g.add(b);
    const beak = mesh(new T.ConeGeometry(0.06, 0.2, 6), mat(0xffb03a), false); beak.rotation.x = -Math.PI / 2; beak.position.z = -0.5; g.add(beak);
    const wings = [-1, 1].map(sd => { const w = mesh(new T.PlaneGeometry(1.4, 0.4), wingM, false); w.geometry.translate(sd * 0.7, 0, 0); g.add(w); return w; });
    scene.add(g);
    const s = ISLANDS[i % ISLANDS.length];
    gulls.push({ g, wings, s, r: s.Re + 2 + (i % 3) * 2, h: 8 + (i % 4), sp: 0.3 + (i % 3) * 0.08, ph: i * 1.3 });
  }

  /* =====================================================================
     PARTICLES: wake foam and spray
     ===================================================================== */
  const FOAM_N = 320, SPRAY_N = 160;
  const foam = new T.InstancedMesh(new T.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }), FOAM_N);
  foam.renderOrder = 6; foam.frustumCulled = false; scene.add(foam);
  const foamP = Array.from({ length: FOAM_N }, () => ({ life: 1, x: 0, z: 0, s: 1, dur: 1 }));
  let foamI = 0;
  function addFoam(x, z, s = 1, dur = 1.6) { const f = foamP[foamI]; foamI = (foamI + 1) % FOAM_N; Object.assign(f, { x, z, s, life: 0, dur }); }
  const spray = new T.InstancedMesh(new T.SphereGeometry(0.12, 6, 5), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), SPRAY_N);
  spray.frustumCulled = false; scene.add(spray);
  const sprayP = Array.from({ length: SPRAY_N }, () => ({ life: 1, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, s: 1 }));
  let sprayI = 0;
  function addSpray(x, y, z, vx, vy, vz, s = 1) { const p = sprayP[sprayI]; sprayI = (sprayI + 1) % SPRAY_N; Object.assign(p, { x, y, z, vx, vy, vz, s, life: 0 }); }
  function splash(x, z, n = 14, power = 1) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = (1 + Math.random() * 2.5) * power; addSpray(x, 0.3, z, Math.cos(a) * sp, (3 + Math.random() * 4) * power, Math.sin(a) * sp, 0.8 + Math.random()); }
    addFoam(x, z, 2.4 * power, 1.8);
  }
  function updateParticles(t, dt) {
    foamP.forEach((f, i) => {
      if (f.life < 1) f.life = Math.min(1, f.life + dt / f.dur);
      const k = f.life, sc = f.life >= 1 ? 0 : f.s * (0.5 + k * 1.6) * Math.pow(1 - k, 0.6);
      dummy.position.set(f.x, waveH(f.x, f.z, t) + 0.06, f.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); foam.setMatrixAt(i, dummy.matrix);
    });
    foam.instanceMatrix.needsUpdate = true;
    sprayP.forEach((p, i) => {
      if (p.life < 1) { p.life += dt / 0.9; p.vy -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < waveH(p.x, p.z, t)) p.life = 1; }
      dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(p.life >= 1 ? 0 : p.s * (1 - p.life * 0.6)); dummy.updateMatrix(); spray.setMatrixAt(i, dummy.matrix);
    });
    spray.instanceMatrix.needsUpdate = true;
  }

  /* =====================================================================
     FLOATING PROPS the boat can push around
     ===================================================================== */
  const props = [];
  const ballTex = stripes(["#ff5d3a", "#ffffff", "#3fb8f0", "#ffffff", "#ffc93a", "#ffffff"], 6);
  function addProp(kind, x, z) {
    let m, r;
    if (kind === "ball") { m = mesh(new T.SphereGeometry(0.75, 24, 16), new T.MeshStandardMaterial({ map: ballTex, roughness: 0.35 })); r = 0.75; }
    else if (kind === "crate") { m = mesh(roundedBox(1.3, 1.1, 1.3, 0.12), mat(0xc58c55, { roughness: 0.7 })); r = 0.9; }
    else {
      m = new T.Group(); r = 0.7;
      const b = mesh(new T.CylinderGeometry(0.55, 0.7, 1.0, 16), new T.MeshStandardMaterial({ map: stripes(["#e8402f", "#ffffff"], 4, false), roughness: 0.4 })); b.position.y = 0.3;
      const tp = mesh(new T.ConeGeometry(0.4, 0.8, 12), mat(0xe8402f)); tp.position.y = 1.2;
      const lt = mesh(new T.SphereGeometry(0.14, 8, 6), basic(0xffe27a), false); lt.position.y = 1.7;
      m.add(b, tp, lt);
    }
    m.position.set(x, 0, z); scene.add(m);
    props.push({ m, kind, x, z, vx: 0, vz: 0, r, spin: 0, rot: Math.random() * 6, tilt: 0 });
  }
  [["buoy", 8, -8], ["ball", -7, -16], ["crate", 16, -42], ["buoy", -12, -32], ["ball", 4, -62], ["crate", -10, -78], ["buoy", 16, -98],
   ["ball", -5, -122], ["crate", 10, -150], ["buoy", -2, -178], ["ball", 24, -6], ["crate", -20, -8], ["ball", 46, -58], ["buoy", -26, -140],
   ["ball", 58, 24], ["buoy", 86, 22]].forEach(([k, x, z]) => addProp(k, x, z));

  /* =====================================================================
     LABELS, HUD, PANEL, TUTORIAL
     ===================================================================== */
  const labelsEl = $("sLabels");
  const mkLabel = (lv, title) => { const el = document.createElement("div"); el.className = "lbl"; el.style.opacity = 0; el.innerHTML = `<small>${esc(lv)}</small><b>${esc(title)}</b>`; labelsEl.appendChild(el); return el; };
  ISLANDS.forEach((s, i) => { s.labelEl = mkLabel(s.about ? "LEVEL 0" : `LEVEL ${i}`, s.about ? "Home Dock · About me" : `${s.name} · ${s.game.short}`); });
  const raceLabel = mkLabel("MINI-GAME", "Boat race"); const raceLabelPos = new T.Vector3(RACE.pos[0], 7, RACE.pos[1]);
  const gameIsl = ISLANDS.filter(s => s.game);
  $("sDots").innerHTML = gameIsl.map(() => "<i></i>").join("");
  function renderProgress() {
    [...$("sDots").children].forEach((d, i) => d.classList.toggle("on", gameIsl[i].visited));
    $("sCnt").textContent = `${gameIsl.filter(s => s.visited).length}/${gameIsl.length}`;
    ISLANDS.forEach(s => { s.labelEl.classList.toggle("done", s.visited); s.ringMat.color.copy(lin(s.visited ? 0x2c9a6a : 0xff7a3d)); });
  }
  function toast(msg, ms = 2600) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), ms); }

  const panel = $("sPanel");
  let panelFor = null, panelDismissed = null, lastInput = "key";
  function setPanel({ cols, eyebrow, icon, title, desc, tags, actions, hint }) {
    $("sTube").innerHTML = cols.map(c => `<i style="background:${c}"></i>`).join("");
    $("sEyebrow").textContent = eyebrow; $("sIcon").innerHTML = icon || ""; $("sTitle").textContent = title; $("sDesc").textContent = desc;
    $("sTags").innerHTML = tags.map(t => `<span>${esc(t)}</span>`).join("");
    const act = $("sActions"); act.innerHTML = ""; actions.forEach(a => act.appendChild(a));
    $("sHint").hidden = !hint;
    panel.classList.add("show"); $("sTut").classList.add("lift");
  }
  const btn = (label, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = label; b.onclick = fn; return b; };
  function showIsland(s) {
    panelFor = s;
    if (s.about) {
      const a = document.createElement("a"); a.className = "cta ghost"; a.href = "#backstory"; a.textContent = "Read my backstory";
      return setPanel({ cols: ["#ff5d3a", "#3fb8f0", "#ffc93a", "#5bcf7a"], eyebrow: "Level 0 · Home Dock", title: PROFILE.name ? `Hi, I'm ${PROFILE.name}` : "Hi, I'm a game designer",
        desc: PROFILE.bio, tags: [PROFILE.role, `${PROFILE.years} years in mobile games`, `${gameIsl.length} islands to visit`], actions: [a] });
    }
    const a = document.createElement("a"); a.className = "cta"; a.href = s.game.url; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = `${storeLabel(s.game)} <span aria-hidden="true">↗</span>`;
    setPanel({ cols: s.game.colors, eyebrow: `Level ${ISLANDS.indexOf(s)} · ${s.name}`, icon: iconHTML(s.game), title: s.game.title, desc: s.game.desc, tags: [...s.game.tags, s.game.store], actions: [a], hint: true });
    if (lastInput === "key") requestAnimationFrame(() => a.focus({ preventScroll: true }));
  }
  const fmtTime = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, "0")}`;
  function showRaceCard() {
    panelFor = "race";
    const best = store.get("cdsPortfolio.raceBest", null);
    setPanel({ cols: ["#16242a", "#ffffff", "#16242a", "#ffffff"], eyebrow: "Mini-game · Boat race", title: "Race to the finish",
      desc: `One lap through ${RACE.cps.length - 1} yellow gates and back to the pontoon. Two rival boats are racing too. Boost with Shift.`,
      tags: [best ? `Best ${fmtTime(best)}` : "No best time yet", "3 boats", "1 lap"], actions: [btn("Start race", "cta", startRace)] });
  }
  function hidePanel() { if (panel.contains(document.activeElement)) document.activeElement.blur(); panel.classList.remove("show"); panelFor = null; $("sTut").classList.remove("lift"); }
  $("sClose").onclick = () => { panelDismissed = panelFor; hidePanel(); };

  const TUT = [
    { key: "Steer the boat with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys", touch: "Touch and drag anywhere to steer" },
    { key: "Hold <kbd>Shift</kbd> to open the throttle", touch: "Drag further out to open the throttle" },
    { key: "Sail into the orange buoy ring at the <b>Home Dock</b>", touch: "Sail into the orange buoy ring at the <b>Home Dock</b>" },
    { key: `Follow the arrow to all ${gameIsl.length} islands. The white ring at the checkered pontoon starts a race.`, touch: `Follow the arrow to all ${gameIsl.length} islands. The white ring at the checkered pontoon starts a race.` },
  ];
  const TUT_KEY = "cdsPortfolio.seaTutDone";
  let tutStep = -1, tutT = 0, moveDist = 0, boostT = 0;
  $("sTutSteps").innerHTML = TUT.map(() => "<i></i>").join("");
  function renderTut() {
    if (tutStep < 0) return;
    const s = TUT[tutStep];
    $("sTutText").innerHTML = isTouch ? s.touch : s.key;
    $("sTutStepLabel").textContent = `Tutorial · ${tutStep + 1}/${TUT.length}`;
    [...$("sTutSteps").children].forEach((d, i) => { d.className = i < tutStep ? "done" : i === tutStep ? "on" : ""; });
  }
  function startTutorial() { tutStep = 0; tutT = 0; moveDist = 0; boostT = 0; $("sTut").classList.remove("hide"); $("sLegend").hidden = true; $("sBtnTut").hidden = true; renderTut(); }
  function hideTutorial() { tutStep = -1; $("sTut").classList.add("hide"); $("sLegend").hidden = false; $("sBtnTut").hidden = false; }
  function nextTut() { tutStep++; tutT = 0; Sound.blip(); if (tutStep >= TUT.length) { hideTutorial(); store.set(TUT_KEY, true); toast("Tutorial complete. Fair winds!"); } else renderTut(); }
  $("sTutSkip").onclick = () => { hideTutorial(); store.set(TUT_KEY, true); };
  $("sBtnTut").onclick = () => { resetBoat(); startTutorial(); };

  /* =====================================================================
     INPUT
     ===================================================================== */
  const keys = {};
  const KEYMAP = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", ShiftLeft: "boost", ShiftRight: "boost" };
  addEventListener("keydown", (e) => {
    if (view !== "sail") return;
    if (e.key === "Escape") { if (panelFor) { panelDismissed = panelFor; hidePanel(); } return; }
    const k = KEYMAP[e.code];
    if (k) { keys[k] = true; lastInput = "key"; if (e.code.startsWith("Arrow")) e.preventDefault(); }
    if (e.code === "KeyR" && race.state === "idle") resetBoat();
    if (e.code === "Space" && document.activeElement === document.body) e.preventDefault();
  });
  addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 }, JOY_R = 60;
  canvas.addEventListener("pointerdown", (e) => {
    if (view !== "sail") return;
    lastInput = "pointer";
    Object.assign(joy, { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
    canvas.setPointerCapture(e.pointerId);
    const j = $("joy"); j.hidden = false; j.style.left = e.clientX + "px"; j.style.top = e.clientY + "px"; j.firstElementChild.style.transform = "";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!joy.active || e.pointerId !== joy.id) return;
    const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy, d = Math.hypot(dx, dy), cl = Math.min(d, JOY_R) / (d || 1);
    joy.dx = dx / JOY_R; joy.dy = dy / JOY_R;
    $("joy").firstElementChild.style.transform = `translate(${dx * cl}px, ${dy * cl}px)`;
  });
  const endJoy = (e) => { if (e.pointerId !== joy.id) return; joy.active = false; joy.dx = joy.dy = 0; $("joy").hidden = true; };
  canvas.addEventListener("pointerup", endJoy); canvas.addEventListener("pointercancel", endJoy);
  let zoom = 1;
  const setZoom = (z) => { zoom = clampN(z, 0.35, 1.4); };
  canvas.addEventListener("wheel", (e) => { if (view !== "sail") return; e.preventDefault(); setZoom(zoom * (1 + e.deltaY * 0.0012)); }, { passive: false });
  $("sZIn").onclick = () => setZoom(zoom * 0.8);
  $("sZOut").onclick = () => setZoom(zoom * 1.25);

  /* =====================================================================
     BOAT PHYSICS (Bruno-style arcade handling: momentum, drift, bob)
     ===================================================================== */
  const boat = { x: 0, z: 24, h: 0, vx: 0, vz: 0, steer: 0, pitch: 0, roll: 0, vf: 0 };
  function resetBoat(x = 0, z = 24, h = 0) { Object.assign(boat, { x, z, h, vx: 0, vz: 0, steer: 0, vf: 0 }); }
  let wakeT = 0, lastBump = 0;
  function readInput() {
    let fwd = 0, steerIn = 0, boost = !!keys.boost;
    if (keys.up) fwd += 1; if (keys.down) fwd -= 1; if (keys.left) steerIn += 1; if (keys.right) steerIn -= 1;
    const jm = Math.hypot(joy.dx, joy.dy);
    if (joy.active && jm > 0.15) {
      const desired = Math.atan2(-joy.dx, -joy.dy);
      let diff = desired - boat.h; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      steerIn = clampN(diff * 2, -1, 1); fwd = Math.min(jm, 1) * (Math.abs(diff) > 2.4 ? 0.4 : 1); boost = jm > 1.35;
    }
    return { fwd, steerIn, boost };
  }
  function updateBoat(dt, t) {
    let { fwd, steerIn, boost } = readInput();
    if (race.state === "countdown") { fwd = 0; steerIn = 0; boost = false; }
    const fx = -Math.sin(boat.h), fz = -Math.cos(boat.h), rx = Math.cos(boat.h), rz = -Math.sin(boat.h);
    let vf = boat.vx * fx + boat.vz * fz, vl = boat.vx * rx + boat.vz * rz;
    const cruise = 16, maxF = boost ? 27 : cruise;
    if (fwd > 0) vf += fwd * (boost ? 24 : 14) * dt; else if (fwd < 0) vf += fwd * (vf > 0 ? 18 : 9) * dt;
    vf *= Math.pow(fwd ? 0.85 : 0.45, dt);
    vf = clampN(vf, -6, maxF);
    if (!boost && vf > cruise) vf = lerp(vf, cruise, 1 - Math.pow(0.12, dt));
    vl *= Math.pow(0.06, dt); // the keel bites, but a fast turn still slides
    boat.steer = lerp(boat.steer, steerIn, 1 - Math.pow(0.003, dt));
    const grip = clampN(vf / 6, -1, 1);
    boat.h += boat.steer * 1.85 * grip * dt;
    boat.vx = fx * vf + rx * vl; boat.vz = fz * vf + rz * vl;
    boat.x += boat.vx * dt; boat.z += boat.vz * dt; boat.vf = vf;
    // islands and pontoon
    for (const o of obstacles) {
      const dx = boat.x - o.x, dz = boat.z - o.z, d = Math.hypot(dx, dz), min = o.r + 1.4;
      if (d < min && d > 1e-4) {
        const nx = dx / d, nz = dz / d, vn = boat.vx * nx + boat.vz * nz;
        boat.x = o.x + nx * min; boat.z = o.z + nz * min;
        if (vn < 0) { boat.vx -= nx * vn * 1.35; boat.vz -= nz * vn * 1.35; }
        if (vn < -4 && t - lastBump > 0.4) { lastBump = t; splash(boat.x - nx, boat.z - nz, 18, 0.8); Sound.splash?.(0.6); }
      }
    }
    // soft world edge
    const ex = boat.x - WORLD.cx, ez = boat.z - WORLD.cz, ed = Math.hypot(ex, ez);
    if (ed > WORLD.r) { boat.vx -= ex / ed * 30 * dt; boat.vz -= ez / ed * 30 * dt; }
    // push floating props
    for (const p of props) {
      const dx = p.x - boat.x, dz = p.z - boat.z, d = Math.hypot(dx, dz), min = p.r + 1.3;
      if (d < min && d > 1e-4) {
        const nx = dx / d, nz = dz / d, push = Math.max(0, boat.vx * nx + boat.vz * nz) + 1.5;
        p.vx += nx * push * 1.1; p.vz += nz * push * 1.1; p.spin += (Math.random() - 0.5) * push;
        p.x = boat.x + nx * min; p.z = boat.z + nz * min;
        if (push > 6 && t - lastBump > 0.25) { lastBump = t; splash(p.x, p.z, 10, 0.6); Sound.splash?.(0.4); }
      }
    }
    // tutorial progress
    if (tutStep >= 0) {
      tutT += dt;
      if (tutStep === 0) { moveDist += Math.abs(vf) * dt; if (moveDist > 18) nextTut(); }
      else if (tutStep === 1) { if (boost && fwd > 0) boostT += dt; if (boostT > 0.7) nextTut(); }
      else if (tutStep === 3 && tutT > 7) nextTut();
    }
    // wake and spray
    wakeT += dt;
    if (Math.abs(vf) > 1.5 && wakeT > 0.035) {
      wakeT = 0;
      const sx = boat.x - fx * 2.3, sz = boat.z - fz * 2.3, s = 0.6 + Math.min(Math.abs(vf) / 20, 1);
      addFoam(sx + rx * 0.55, sz + rz * 0.55, s, 1.8); addFoam(sx - rx * 0.55, sz - rz * 0.55, s, 1.8);
      if (vf > 11) for (let i = 0; i < 2; i++) { const sd = i ? 1 : -1; addSpray(boat.x + fx * 1.6 + rx * sd * 0.7, 0.4, boat.z + fz * 1.6 + rz * sd * 0.7, rx * sd * (2 + Math.random() * 2) + boat.vx * 0.3, 2 + Math.random() * 2.5, rz * sd * (2 + Math.random() * 2) + boat.vz * 0.3, 0.7); }
    }
  }
  function placeBoat(b, x, z, h, vf, steer, t, dt) {
    const e = 1.2, wy = waveH(x, z, t);
    const fx = -Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const slopeF = (waveH(x + fx * e, z + fz * e, t) - waveH(x - fx * e, z - fz * e, t)) / (2 * e);
    const slopeR = (waveH(x + rx * e, z + rz * e, t) - waveH(x - rx * e, z - rz * e, t)) / (2 * e);
    b.g.position.set(x, wy * 0.85 + 0.22 + Math.min(Math.max(vf, 0) / 27, 1) * 0.16, z);
    b.g.rotation.order = "YXZ";
    const pitch = Math.atan(slopeF) * 0.8 + Math.min(Math.max(vf, 0), 27) * 0.006;
    const roll = -Math.atan(slopeR) * 0.8 - steer * Math.min(Math.abs(vf) / 16, 1) * 0.16;
    b.g.rotation.y = h;
    b.g.rotation.x = lerp(b.g.rotation.x, pitch, 1 - Math.pow(0.02, dt));
    b.g.rotation.z = lerp(b.g.rotation.z, roll, 1 - Math.pow(0.02, dt));
    b.prop.rotation.z += vf * dt * 3;
  }

  /* =====================================================================
     BOAT RACE
     ===================================================================== */
  const race = { state: "idle", t: 0, cp: 0, countT: 0, rivals: [], place: 0, finishedRivals: 0 };
  const raceCurve = new T.CatmullRomCurve3([new T.Vector3(RACE.pos[0], 0, RACE.pos[1] + 7), ...RACE.cps.map(c => new T.Vector3(c[0], 0, c[1]))], false, "centripetal");
  const raceLen = raceCurve.getLength();
  function parkRivals() { rivals.forEach((r, i) => { r.state = { x: RACE.pos[0] + (i ? 3.4 : -3.4), z: RACE.pos[1] - 4.2, h: Math.PI, u: 0, done: false, fin: 0 }; }); }
  parkRivals();
  function startRace() {
    hidePanel(); panelDismissed = "race";
    race.state = "countdown"; race.countT = 0; race.t = 0; race.cp = 0; race.finishedRivals = 0;
    resetBoat(RACE.pos[0], RACE.pos[1] + 9, 0);
    rivals.forEach((r, i) => { r.state = { x: RACE.pos[0] + (i ? 3.6 : -3.6), z: RACE.pos[1] + 10, h: 0, u: 0, done: false, fin: 0, speed: i ? 17.6 : 15.8 }; });
    cpGates.forEach((g, i) => { g.g.visible = true; });
    $("sTimerChip").hidden = false; $("sQuit").hidden = false; $("sTime").textContent = "0:00.0";
    showBig("3"); Sound.blip();
  }
  function endRace(quit) {
    race.state = "idle";
    cpGates.forEach(g => { g.g.visible = false; });
    $("sTimerChip").hidden = true; $("sQuit").hidden = true; $("sBig").hidden = true;
    parkRivals();
    if (quit) toast("Race cancelled");
  }
  $("sQuit").onclick = () => endRace(true);
  let bigT = null;
  function showBig(text) { const el = $("sBig"); el.textContent = text; el.hidden = false; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); clearTimeout(bigT); if (text === "GO!") bigT = setTimeout(() => { el.hidden = true; }, 700); }
  function updateRace(dt, t) {
    if (race.state === "countdown") {
      const prev = Math.floor(race.countT / 0.8); race.countT += dt; const now = Math.floor(race.countT / 0.8);
      if (now !== prev) { if (now < 3) { showBig(String(3 - now)); Sound.blip(); } else { showBig("GO!"); Sound.chime(); race.state = "racing"; } }
    }
    if (race.state !== "racing") return;
    race.t += dt; $("sTime").textContent = fmtTime(race.t);
    // player gates
    const c = RACE.cps[race.cp];
    cpGates.forEach((g, i) => { const on = i === race.cp; g.m.color.copy(lin(on ? 0xffd23f : 0xffffff)); g.m.opacity = i < race.cp ? 0 : on ? 0.95 : 0.35; g.ring.scale.setScalar(on ? 1 + Math.sin(t * 6) * 0.04 : 1); g.g.visible = i >= race.cp; });
    if (Math.hypot(boat.x - c[0], boat.z - c[1]) < 5.2) {
      race.cp++; Sound.blip(); splash(c[0], c[1], 8, 0.5);
      if (race.cp >= RACE.cps.length) {
        race.state = "done"; const place = 1 + race.finishedRivals;
        const best = store.get("cdsPortfolio.raceBest", null), isBest = !best || race.t < best;
        if (isBest) store.set("cdsPortfolio.raceBest", race.t);
        showBig(place === 1 ? "1ST!" : place === 2 ? "2ND" : "3RD");
        if (place === 1) Sound.fanfare(); else Sound.chime();
        setTimeout(() => {
          $("sBig").hidden = true;
          setPanel({ cols: ["#ffd23f", "#ff5d3a", "#3fb8f0", "#5bcf7a"], eyebrow: "Boat race · Result", title: place === 1 ? "You won the race!" : `You finished ${place === 2 ? "2nd" : "3rd"}`,
            desc: `Your time: ${fmtTime(race.t)}.${isBest ? " That's a new best time." : ` Best: ${fmtTime(best)}.`}`, tags: [`Place ${place}/3`, `Time ${fmtTime(race.t)}`],
            actions: [btn("Race again", "cta", startRace), btn("Close", "cta ghost", () => { hidePanel(); endRace(false); })] });
          panelFor = "result";
        }, 1400);
      }
    }
  }
  function updateRivals(dt, t) {
    rivals.forEach((r, i) => {
      const s = r.state;
      if (race.state === "racing" && !s.done) {
        const playerU = race.cp / RACE.cps.length;
        const band = s.u > playerU + 0.12 ? 0.9 : s.u < playerU - 0.12 ? 1.12 : 1; // rubber band
        s.u += (s.speed * band) * dt / raceLen;
        if (s.u >= 1) { s.u = 1; s.done = true; race.finishedRivals++; }
        const p = raceCurve.getPointAt(Math.min(s.u, 1)), tan = raceCurve.getTangentAt(Math.min(s.u, 0.999));
        const off = Math.sin(t * 0.8 + i * 2) * 1.6 + (i ? 2.2 : -2.2);
        s.x = p.x + tan.z * off; s.z = p.z - tan.x * off; s.h = Math.atan2(-tan.x, -tan.z); s.vf = s.done ? 0 : s.speed;
        if (Math.random() < 0.5) addFoam(s.x + Math.sin(s.h) * 2.2, s.z + Math.cos(s.h) * 2.2, 0.9, 1.6);
      } else s.vf = lerp(s.vf || 0, 0, 1 - Math.pow(0.1, dt));
      placeBoat(r, s.x, s.z, s.h, s.vf || 0, 0, t, dt);
    });
  }

  /* =====================================================================
     GUIDE ARROW, CAMERA, LOOP
     ===================================================================== */
  const arrowShape = new T.Shape();
  arrowShape.moveTo(0, 1.1); arrowShape.quadraticCurveTo(0.25, 0.6, 0.75, -0.35); arrowShape.quadraticCurveTo(0.35, -0.15, 0, 0); arrowShape.quadraticCurveTo(-0.35, -0.15, -0.75, -0.35); arrowShape.quadraticCurveTo(-0.25, 0.6, 0, 1.1);
  const arrowM = basic(0xffffff, { transparent: true, opacity: 0.9, depthWrite: false });
  const arrow = new T.Mesh(new T.ShapeGeometry(arrowShape, 10), arrowM); arrow.rotation.order = "YXZ"; arrow.renderOrder = 8; scene.add(arrow);

  const camPos = new T.Vector3(0, 30, 60), camLook = new T.Vector3(0, 0, 30), tmp = new T.Vector3();
  function resize() { const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener("resize", () => { if (view === "sail") resize(); });

  function applyTheme() {
    P = isDark() ? PAL.dusk : PAL.day;
    sunDir.set(...P.sunDir).normalize();
    scene.fog.color.set(P.fog); scene.background = null;
    skyMat.uniforms.uTop.value.set(P.skyTop); skyMat.uniforms.uLow.value.set(P.skyLow); skyMat.uniforms.uSunCol.value.set(P.sun);
    const u = waterMat.uniforms; u.uDeep.value.set(P.deep); u.uShallow.value.set(P.shallow); u.uFoam.value.set(P.foam); u.uSky.value.set(P.skyLow); u.uSunCol.value.set(P.sun); u.uFog.value.set(P.fog);
    floorMat.uniforms.uDeep.value.set(P.deep); floorMat.uniforms.uFog.value.set(P.fog);
    hemi.intensity = P.hemi; key.intensity = P.key; key.color.set(P.sun); renderer.toneMappingExposure = P.exposure;
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  let qAcc = 0, qN = 0, slow = 0;
  function adaptQuality(rawDt) {
    if (document.hidden || rawDt > 0.05) return;
    qAcc += rawDt; qN++; if (qN < 90) return;
    const avg = qAcc / qN; qAcc = 0; qN = 0; slow = avg > 0.024 ? slow + 1 : 0;
    if (slow >= 2 && dpr > 1) { slow = 0; dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); }
    else if (avg < 0.0135 && dpr < DPR_MAX) { dpr = Math.min(DPR_MAX, dpr + 0.25); renderer.setPixelRatio(dpr); resize(); }
  }

  let running = false, last = performance.now(), t = 0;
  function frame(now) {
    if (view !== "sail") { running = false; return; }
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000, dt = Math.min(rawDt, 1 / 20); last = now; t += dt;
    adaptQuality(rawDt);
    updateBoat(dt, t); updateRace(dt, t); updateRivals(dt, t);
    Sound.engine(boat.vf);
    placeBoat(player, boat.x, boat.z, boat.h, boat.vf, boat.steer, t, dt);
    const fl = player.flag.geometry.attributes.position;
    // islands: visit rings
    let on = null;
    if (race.state === "idle") {
      for (const s of ISLANDS) if (Math.hypot(boat.x - s.ring[0], boat.z - s.ring[1]) < RING_R + 0.4) { on = s; break; }
      if (!on && Math.hypot(boat.x - raceZone.x, boat.z - raceZone.z) < raceZone.r) on = "race";
    }
    if (on !== panelFor && panelFor !== "result") {
      if (on && on !== panelDismissed) {
        if (on === "race") showRaceCard(); else showIsland(on);
        if (on !== "race") {
          if (tutStep === 2 && on.about) nextTut();
          if (on.game && !on.visited) {
            on.visited = true; renderProgress(); store.set("cdsPortfolio.seaVisited", ISLANDS.filter(s => s.visited).map(s => s.key));
            splash(on.ring[0], on.ring[1], 16, 0.8); Sound.chime();
            if (gameIsl.every(s => s.visited)) { toast(`All ${gameIsl.length} islands visited ★ Fair winds!`, 4000); Sound.fanfare(); }
            if (tutStep === 3) nextTut();
          }
        }
      } else if (!on && panelFor) hidePanel();
    }
    if (!on && panelDismissed && panelDismissed !== "race") panelDismissed = null;
    if (!on && panelDismissed === "race" && race.state === "idle") panelDismissed = null;

    // camera: fixed angle follow with look-ahead, framing the island when a card is open
    const portrait = camera.aspect < 0.9, k = (portrait ? 1.7 : 1) * zoom;
    const ahead = clampN(boat.vf * 0.35, -2, 8);
    tmp.set(boat.x - Math.sin(boat.h) * ahead, 0, boat.z - Math.cos(boat.h) * ahead - (portrait ? 4 : 0));
    if (panelFor && panelFor.pos) tmp.set((boat.x + panelFor.pos[0]) / 2, 0, (boat.z + panelFor.pos[1]) / 2 + (portrait ? 6 : 0));
    camLook.lerp(tmp, 1 - Math.pow(0.03, dt));
    camPos.set(camLook.x, 26 * k, camLook.z + 25 * k);
    camera.position.lerp(camPos, 1 - Math.pow(0.002, dt));
    camera.lookAt(camLook);
    sky.position.copy(camera.position);
    water.position.set(Math.round(camLook.x / WSTEP) * WSTEP, 0, Math.round(camLook.z / WSTEP) * WSTEP);
    floor.position.x = water.position.x; floor.position.z = water.position.z;
    key.position.set(boat.x + sunDir.x * 60, sunDir.y * 60, boat.z + sunDir.z * 60); key.target.position.set(boat.x, 0, boat.z);
    waterMat.uniforms.uTime.value = t; floorMat.uniforms.uTime.value = t;

    // guide arrow: next race gate, else the next island not yet visited
    let target = null;
    if (race.state === "racing") target = RACE.cps[race.cp];
    else if (tutStep >= 0 && tutStep <= 2) target = tutStep === 2 ? ISLANDS[0].ring : null;
    else { const nx = gameIsl.find(s => !s.visited); target = nx ? nx.ring : null; }
    arrow.visible = false;
    if (target) {
      const dx = target[0] - boat.x, dz = target[1] - boat.z, d = Math.hypot(dx, dz);
      if (d > 7) { const a = Math.atan2(dx, dz); arrow.visible = true; arrow.position.set(boat.x + Math.sin(a) * 4.2, waveH(boat.x, boat.z, t) + 0.5, boat.z + Math.cos(a) * 4.2); arrow.rotation.set(-Math.PI / 2, a + Math.PI, 0); arrowM.opacity = 0.65 + Math.sin(t * 5) * 0.25; }
    }

    // world animation
    ISLANDS.forEach((s, i) => { s.ringObj.position.y = waveH(s.ring[0], s.ring[1], t) * 0.8; s.ringObj.rotation.y = t * 0.2 + i; });
    raceZoneRing.position.y = waveH(raceZone.x, raceZone.z, t) * 0.8 + 0.15;
    raceStart.position.y = waveH(RACE.pos[0], RACE.pos[1], t) * 0.4;
    cpGates.forEach(g => { if (g.g.visible) g.g.position.y = waveH(g.g.position.x, g.g.position.z, t) * 0.7; });
    animated.forEach(f => f(t, dt));
    clouds.forEach((c, i) => { c.position.x += dt * (0.8 + (i % 3) * 0.3); if (c.position.x > 180) c.position.x = -160; });
    for (let i = 0; i < fl.count; i++) { const x = fl.getX(i); fl.setZ(i, Math.sin(x * 8 + t * 14) * 0.05 * (x + 0.3)); } fl.needsUpdate = true;
    props.forEach(p => {
      p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= Math.pow(0.35, dt); p.vz *= Math.pow(0.35, dt); p.spin *= Math.pow(0.5, dt); p.rot += p.spin * dt;
      for (const o of obstacles) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = o.r + p.r; if (d < min && d > 1e-4) { p.x = o.x + dx / d * min; p.z = o.z + dz / d * min; p.vx *= -0.4; p.vz *= -0.4; } }
      const wy = waveH(p.x, p.z, t);
      p.m.position.set(p.x, wy * 0.9 + (p.kind === "ball" ? 0.45 : p.kind === "crate" ? 0.2 : 0), p.z);
      p.m.rotation.set(Math.sin(t * 1.3 + p.x) * 0.15 + (p.kind === "ball" ? p.rot : 0), p.rot, Math.cos(t * 1.1 + p.z) * 0.15);
    });
    updateFish(t);
    turtles.forEach(tt => { const a = t * tt.sp + tt.ph, R = tt.r; tt.g.position.set(tt.s.pos[0] + Math.cos(a) * R, tt.depth + Math.sin(t * 0.8 + tt.ph) * 0.2, tt.s.pos[1] + Math.sin(a) * R); tt.g.rotation.y = Math.atan2(Math.sin(a), -Math.cos(a)); const f = Math.sin(t * 2.4 + tt.ph); tt.flips.forEach((fp, k) => { fp.rotation.z = (k % 2 ? -1 : 1) * f * 0.5; fp.rotation.y = f * 0.3; }); });
    dolphins.forEach((d) => {
      const a = t * d.sp + d.ph, x = d.cx + Math.cos(a) * d.r, z = d.cz + Math.sin(a) * d.r;
      const tx = -Math.sin(a) * Math.sign(d.sp), tz = Math.cos(a) * Math.sign(d.sp), v = Math.abs(d.sp) * d.r;
      const cyc = (t + d.ph * 2) % d.period, k = cyc / 1.5;
      let y = -1.6, pitch = 0;
      if (k < 1) { y = -1.5 + Math.sin(Math.PI * k) * 4.4; pitch = Math.atan2(Math.cos(Math.PI * k) * Math.PI * 4.4 / 1.5, v); }
      if (d.lastK < 0.08 && k >= 0.08 && k < 1) splash(x, z, 12, 0.7);
      if (d.lastK < 0.92 && k >= 0.92 && k < 1) { splash(x, z, 16, 0.9); }
      d.lastK = k;
      d.g.position.set(x, y, z); d.g.rotation.set(pitch, Math.atan2(-tx, -tz), 0);
    });
    { const a = t * 0.05, R = 40, x = -82 + Math.cos(a) * R, z = -82 + Math.sin(a) * R, cyc = t % 22, up = cyc < 5 ? Math.sin(cyc / 5 * Math.PI) : 0;
      whale.g.position.set(x, -3.6 + up * 2.6, z); whale.g.rotation.y = Math.atan2(Math.sin(a), -Math.cos(a)); whale.tail.rotation.x = Math.sin(t * 1.2) * 0.25;
      if (cyc > 2.2 && cyc < 2.9 && Math.random() < 0.6) addSpray(x + Math.sin(whale.g.rotation.y) * -3, 0.5, z + Math.cos(whale.g.rotation.y) * -3, (Math.random() - 0.5) * 1.5, 9 + Math.random() * 4, (Math.random() - 0.5) * 1.5, 1.2); }
    rays.forEach(r => { const a = t * r.sp + r.ph; r.g.position.set(r.cx + Math.cos(a) * r.r, -2.6, r.cz + Math.sin(a) * r.r); r.g.rotation.y = Math.atan2(Math.sin(a), -Math.cos(a)); const f = Math.sin(t * 2 + r.ph) * 0.35; r.wings[0].rotation.z = f; r.wings[1].rotation.z = -f; });
    gulls.forEach(gl => { const a = t * gl.sp + gl.ph; gl.g.position.set(gl.s.pos[0] + Math.cos(a) * gl.r, gl.h + Math.sin(t + gl.ph) * 0.6, gl.s.pos[1] + Math.sin(a) * gl.r); gl.g.rotation.set(0, Math.atan2(Math.sin(a), -Math.cos(a)), Math.sin(t * 0.7) * 0.2); const f = Math.sin(t * 7 + gl.ph) * 0.5; gl.wings[0].rotation.z = f; gl.wings[1].rotation.z = -f; });
    updateParticles(t, dt);

    renderer.render(scene, camera);
    const w = host.clientWidth, h = host.clientHeight;
    const place = (el, pos) => { tmp.copy(pos).project(camera); const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15; el.style.opacity = vis ? 1 : 0; if (vis) el.style.transform = `translate(${((tmp.x + 1) / 2 * w).toFixed(1)}px, ${((1 - tmp.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`; };
    ISLANDS.forEach(s => place(s.labelEl, s.labelPos));
    place(raceLabel, raceLabelPos);
  }

  /* ---------- public API used by the tabs ---------- */
  const saved = store.get("cdsPortfolio.seaVisited", []);
  ISLANDS.forEach(s => { s.visited = saved.includes(s.key); });
  applyTheme(); renderProgress(); resetBoat();
  Sea.enter = () => {
    Sound.start(); resize();
    if (race.state === "idle") { resetBoat(); camera.position.set(0, 40, 68); camLook.set(0, 0, 22); }
    panelDismissed = null;
    if (!store.get(TUT_KEY, false)) startTutorial(); else hideTutorial();
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  };
  Sea.leave = () => { Sound.stop(); hidePanel(); $("sTut").classList.add("hide"); tutStep = -1; joy.active = false; $("joy").hidden = true; for (const k in keys) keys[k] = false; if (race.state !== "idle") endRace(false); };
  Sea.onTouch = () => renderTut();
  Sea.stats = () => { let meshes = 0; scene.traverse(o => { if (o.isMesh) meshes++; }); return { meshes, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr }; };
};
