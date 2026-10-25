// Hero toy: click a "+" cell to drop a bubble, drag and throw them, click one to pop it.
// The big bloom behind the name can be grabbed too; it detaches into the same physics.
(() => {
  const hero = document.querySelector('.hero');
  const bloom = hero && hero.querySelector('.bloom');
  if (!hero) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX = 16;
  const FILLS = [
    'radial-gradient(circle at 35% 35%, #8bc0df, #5aa7d4)', // bloom
    'radial-gradient(circle at 35% 35%, #faf1eb, #c6d9e6)', // sky
    'ring',                                                  // night outline; a solid fill would swallow the black type
    'radial-gradient(circle at 35% 35%, #c6d9e6, #8bc0df)',
  ];

  const layer = document.createElement('span'); // span: keeps the mobile div:nth-last-of-type rule counting cells only
  layer.className = 'bubbles';
  layer.setAttribute('aria-hidden', 'true');
  hero.appendChild(layer);

  const bubbles = [];
  let W = 0, H = 0, raf = 0, visible = true;
  const pointer = { x: -1e4, y: -1e4 };

  const measure = () => {
    W = hero.clientWidth; H = hero.clientHeight;
    for (const b of bubbles) clampInside(b);
  };

  function clampInside(b) {
    b.x = Math.min(Math.max(b.x, b.r), W - b.r);
    b.y = Math.min(Math.max(b.y, b.r), H - b.r);
  }

  function add(x, y, r, fill, v = 1) {
    if (bubbles.length >= MAX) pop(bubbles.find(b => !b.held));
    const el = document.createElement('span');
    el.className = 'bubble';
    el.style.width = el.style.height = r * 2 + 'px';
    if (fill === 'ring') el.style.border = '1.5px solid #000032';
    else el.style.background = fill;
    layer.appendChild(el);
    const a = Math.random() * Math.PI * 2;
    const b = { x, y, r, vx: reduced ? 0 : Math.cos(a) * 3 * v, vy: reduced ? 0 : Math.sin(a) * 3 * v, el, held: false };
    clampInside(b);
    bubbles.push(b);
    bindDrag(b);
    draw(b);
    wake();
    return b;
  }

  function pop(b) {
    if (!b) return;
    bubbles.splice(bubbles.indexOf(b), 1);
    b.el.classList.add('popping');
    setTimeout(() => b.el.remove(), 260);
  }

  const draw = b => { b.el.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`; };

  function bindDrag(b) {
    let lastX, lastY, lastT, moved;
    b.el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { b.el.setPointerCapture(e.pointerId); } catch {}
      b.held = true; moved = 0;
      b.el.classList.add('held');
      const box = hero.getBoundingClientRect();
      b.ox = e.clientX - box.left - b.x; b.oy = e.clientY - box.top - b.y;
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
      b.vx = b.vy = 0;
    });
    b.el.addEventListener('pointermove', e => {
      if (!b.held) return;
      const box = hero.getBoundingClientRect(), now = performance.now(), dt = Math.max(now - lastT, 1);
      b.x = e.clientX - box.left - b.ox; b.y = e.clientY - box.top - b.oy;
      clampInside(b);
      // throw velocity in px per frame (~16ms)
      b.vx = (e.clientX - lastX) / dt * 16; b.vy = (e.clientY - lastY) / dt * 16;
      moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY; lastT = now;
      draw(b); wake();
    });
    const release = () => {
      if (!b.held) return;
      b.held = false;
      b.el.classList.remove('held');
      if (moved < 4) return pop(b);
      if (reduced) b.vx = b.vy = 0;
      wake();
    };
    b.el.addEventListener('pointerup', release);
    b.el.addEventListener('pointercancel', release);
  }

  function step() {
    raf = 0;
    let energy = 0;
    for (const b of bubbles) {
      if (b.held) continue;
      // cursor nudges nearby bubbles away
      const dx = b.x - pointer.x, dy = b.y - pointer.y, d = Math.hypot(dx, dy), reach = b.r + 40;
      if (!reduced && d < reach && d > 0) { const f = (reach - d) / reach * 0.6; b.vx += dx / d * f; b.vy += dy / d * f; }
      b.vx *= 0.985; b.vy *= 0.985;
      b.x += b.vx; b.y += b.vy;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.8; }
      if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.8; }
    }
    // circle-circle: push apart, swap velocity along the normal (mass ~ area)
    for (let i = 0; i < bubbles.length; i++) for (let j = i + 1; j < bubbles.length; j++) {
      const a = bubbles[i], c = bubbles[j];
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01, overlap = a.r + c.r - d;
      if (overlap <= 0) continue;
      const nx = dx / d, ny = dy / d;
      const ma = a.held ? 1e9 : a.r * a.r, mc = c.held ? 1e9 : c.r * c.r, sum = ma + mc;
      a.x -= nx * overlap * (mc / sum); a.y -= ny * overlap * (mc / sum);
      c.x += nx * overlap * (ma / sum); c.y += ny * overlap * (ma / sum);
      const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (rel < 0) {
        const imp = -1.8 * rel / (1 / ma + 1 / mc);
        if (!a.held) { a.vx -= imp / ma * nx; a.vy -= imp / ma * ny; }
        if (!c.held) { c.vx += imp / mc * nx; c.vy += imp / mc * ny; }
      }
    }
    for (const b of bubbles) { if (!b.held) clampInside(b); draw(b); energy += Math.abs(b.vx) + Math.abs(b.vy); }
    // sleep when everything has settled; any input wakes it again
    if (energy > 0.05 || bubbles.some(b => b.held)) wake();
  }

  function wake() { if (!raf && visible) raf = requestAnimationFrame(step); }

  // spawn from the "+" cells
  hero.addEventListener('click', e => {
    const cell = e.target.closest('.plus');
    if (!cell) return;
    const box = hero.getBoundingClientRect();
    const r = 18 + Math.random() * 42;
    add(e.clientX - box.left, e.clientY - box.top, r, FILLS[Math.floor(Math.random() * FILLS.length)]);
  });

  hero.addEventListener('pointermove', e => {
    const box = hero.getBoundingClientRect();
    pointer.x = e.clientX - box.left; pointer.y = e.clientY - box.top;
    if (bubbles.length) wake();
  });
  hero.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });

  // the bloom: same look at rest, detaches into a real bubble when grabbed
  if (bloom) {
    bloom.addEventListener('pointerdown', e => {
      const hb = hero.getBoundingClientRect(), bb = bloom.getBoundingClientRect();
      const b = add(bb.left - hb.left + bb.width / 2, bb.top - hb.top + bb.height / 2, bb.width / 2, getComputedStyle(bloom).backgroundImage, 0);
      bloom.style.visibility = 'hidden';
      b.el.dispatchEvent(new PointerEvent('pointerdown', e));
    }, { once: true });
  }

  new ResizeObserver(measure).observe(hero);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) wake(); }).observe(hero);
  measure();
})();
