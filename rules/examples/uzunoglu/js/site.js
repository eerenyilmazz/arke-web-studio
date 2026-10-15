// Uzunoğlu Turşuculuk: theme switch, scroll reveals, label stamps and brine bubbles from the cursor.
(() => {
  const root = document.documentElement;
  const KEY = "uzunoglu-theme";
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Light/dark: follows the device, the button overrides and is remembered on this device only.
  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  for (const btn of document.querySelectorAll("[data-theme-toggle]")) {
    btn.setAttribute("aria-pressed", String(isDark()));
    btn.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      const apply = () => { root.dataset.theme = next; btn.setAttribute("aria-pressed", String(next === "dark")); };
      if (document.startViewTransition && !still) document.startViewTransition(apply); else apply();
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
    });
  }

  // label-stamp and reveal: elements are stamped / faded in once they enter the screen.
  const targets = document.querySelectorAll(".reveal, .label-stamp");
  if (still || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -10% 0px" });
    targets.forEach((el) => io.observe(el));
  }

  // brine-bubbles: fermentation bubbles rise from the cursor over the kitchen window.
  const scene = document.querySelector("[data-anim='brine-bubbles']");
  if (!scene || still || !matchMedia("(pointer: fine)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  scene.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const bubbles = [];
  const MAX = 90;
  let w = 0, h = 0, running = false, last = null;
  const resize = () => {
    const r = scene.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  new ResizeObserver(resize).observe(scene);

  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.life++; b.y -= b.speed; b.x += Math.sin((b.life + b.seed) / 9) * 0.5;
      const t = 1 - b.life / b.max;
      if (t <= 0) { bubbles.splice(i, 1); continue; }
      ctx.globalAlpha = t * 0.9;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = t * 0.6;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (bubbles.length) requestAnimationFrame(tick); else running = false;
  };

  scene.addEventListener("pointermove", (e) => {
    const r = scene.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const moved = last ? Math.hypot(x - last.x, y - last.y) : 0;
    last = { x, y };
    if (moved < 3) return;
    for (let i = 0; i < Math.min(3, 1 + moved / 15) && bubbles.length < MAX; i++) {
      bubbles.push({ x: x + (Math.random() - 0.5) * 10, y, r: 2 + Math.random() * 5, speed: 0.6 + Math.random() * 1.2, life: 0, max: 60 + Math.random() * 50, seed: Math.random() * 50 });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  });
  scene.addEventListener("pointerleave", () => { last = null; });
})();
