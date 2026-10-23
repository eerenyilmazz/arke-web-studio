/*
 * Arke Web Studio motion kit (provided by the factory; do not rewrite it). Load it where motion is used:
 *   <script src="/js/motion.js" defer></script>
 * Tested parts to compose the signature motion and the supporting animations from, instead of writing them anew.
 *
 * Call it from your own script after the kit has loaded:
 *   document.addEventListener("DOMContentLoaded", function () { SFMotion.sequence([...]); });
 * brand/signature.html may load this file too (the only script file it may use; everything else inline).
 *
 * SFMotion.sequence(steps, root?) plays a storyboard with the Web Animations API, beat by beat like the design plan:
 *   SFMotion.sequence([
 *     { target: ".mark-base", keyframes: [{ transform: "scaleY(0)" }, { transform: "none" }], at: 0, duration: 500, easing: SFMotion.ease.out },
 *     { target: ".mark-line", draw: true, at: 300, duration: 700 },
 *     { target: ".headline .word", keyframes: [{ opacity: 0, transform: "translateY(0.6em)" }, { opacity: 1, transform: "none" }], at: 700, duration: 450, stagger: 60 },
 *   ]);
 *   `target` is a selector (all matches) or an element; `draw: true` draws an SVG stroke; `stagger` delays each match.
 *   Returns a Promise that resolves when the last beat ends. Under reduced motion every target jumps to its end.
 *
 * Declarative parts (start when the element comes into view):
 *   data-reveal="up|down|left|right|fade|scale|clip"  [data-delay="ms"]; a parent with data-stagger="ms" spaces its children
 *   data-draw   on an SVG path/line/polyline/circle/rect: draws the stroke  [data-duration] [data-delay]
 *   data-split="words|chars": splits the text and reveals it in order  [data-stagger]
 *   data-scene: sets --p from 0 to 1 while the element crosses the screen; use it in CSS, e.g.
 *               transform: translateY(calc((1 - var(--p)) * 40px)) rotate(calc(var(--p) * 8deg));
 *   data-count="1250": counts up to the number (only for real figures)  [data-duration]
 * Easing presets: SFMotion.ease.out, .inOut, .spring (also as CSS variables --ease-out, --ease-in-out, --ease-spring in base.css).
 */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ease = {
    out: "cubic-bezier(0.16, 1, 0.3, 1)",
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    spring: "linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1.004 83.8%, 1)",
  };

  function all(target, root) {
    if (!target) return [];
    if (typeof target !== "string") return [target];
    return Array.prototype.slice.call((root || document).querySelectorAll(target));
  }

  function strokeLength(el) {
    try {
      return el.getTotalLength ? el.getTotalLength() : 0;
    } catch (e) {
      return 0;
    }
  }

  function drawKeyframes(el) {
    var len = Math.ceil(strokeLength(el)) || 1000;
    el.style.strokeDasharray = String(len);
    return [{ strokeDashoffset: len }, { strokeDashoffset: 0 }];
  }

  function finalState(el, keyframes) {
    var last = keyframes[keyframes.length - 1];
    for (var k in last) if (k !== "offset" && k !== "easing") el.style[k] = last[k];
  }

  function sequence(steps, root) {
    var ends = [];
    steps.forEach(function (s) {
      all(s.target, root).forEach(function (el, i) {
        var keyframes = s.draw ? drawKeyframes(el) : s.keyframes;
        if (!keyframes) return;
        if (reduce || !el.animate) {
          finalState(el, keyframes);
          return;
        }
        var a = el.animate(keyframes, {
          duration: s.duration || 600,
          delay: (s.at || 0) + (s.stagger || 0) * i,
          easing: s.easing || ease.out,
          fill: "both",
          iterations: s.iterations || 1,
        });
        ends.push(a.finished.catch(function () {}));
      });
    });
    return Promise.all(ends);
  }

  // ---- declarative parts
  function splitText(el) {
    var mode = el.getAttribute("data-split") === "chars" ? "chars" : "words";
    var gap = Number(el.getAttribute("data-stagger")) || (mode === "chars" ? 25 : 60);
    var text = el.textContent;
    el.setAttribute("aria-label", text.trim());
    el.textContent = "";
    var parts = mode === "chars" ? Array.from(text) : text.split(/(\s+)/);
    var n = 0;
    parts.forEach(function (p) {
      if (/^\s+$/.test(p)) {
        el.appendChild(document.createTextNode(p));
        return;
      }
      var span = document.createElement("span");
      span.className = "sf-split";
      span.setAttribute("aria-hidden", "true");
      span.textContent = p;
      span.style.setProperty("--sf-delay", n * gap + "ms");
      n++;
      el.appendChild(span);
    });
  }

  function reveal(el) {
    if (el.hasAttribute("data-draw")) {
      sequence([{ target: el, draw: true, at: Number(el.getAttribute("data-delay")) || 0, duration: Number(el.getAttribute("data-duration")) || 900, easing: ease.inOut }]);
    }
    if (el.hasAttribute("data-count")) count(el);
    el.classList.add("is-in");
  }

  function count(el) {
    var to = Number(el.getAttribute("data-count"));
    if (!isFinite(to)) return;
    var dur = Number(el.getAttribute("data-duration")) || 1200;
    var fmt = new Intl.NumberFormat(document.documentElement.lang || undefined);
    if (reduce) {
      el.textContent = fmt.format(to);
      return;
    }
    var start = performance.now();
    (function tick(now) {
      var t = Math.min(1, (now - start) / dur);
      el.textContent = fmt.format(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }

  function setup() {
    document.querySelectorAll("[data-split]").forEach(splitText);
    document.querySelectorAll("[data-stagger]:not([data-split])").forEach(function (parent) {
      var gap = Number(parent.getAttribute("data-stagger")) || 80;
      Array.prototype.forEach.call(parent.querySelectorAll(":scope > [data-reveal]"), function (child, i) {
        if (!child.hasAttribute("data-delay")) child.style.setProperty("--sf-delay", i * gap + "ms");
      });
    });
    document.querySelectorAll("[data-reveal][data-delay]").forEach(function (el) {
      el.style.setProperty("--sf-delay", (Number(el.getAttribute("data-delay")) || 0) + "ms");
    });
    var watched = document.querySelectorAll("[data-reveal], [data-draw], [data-split], [data-count]");
    if (reduce || !("IntersectionObserver" in window)) {
      watched.forEach(function (el) {
        if (el.hasAttribute("data-count")) count(el);
        el.classList.add("is-in");
      });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            reveal(e.target);
          });
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
      );
      watched.forEach(function (el) {
        io.observe(el);
      });
    }

    var scenes = document.querySelectorAll("[data-scene]");
    if (scenes.length) {
      var queued = false;
      var update = function () {
        queued = false;
        var h = window.innerHeight;
        scenes.forEach(function (el) {
          var r = el.getBoundingClientRect();
          var p = reduce ? 1 : Math.min(1, Math.max(0, (h - r.top) / (h + r.height)));
          el.style.setProperty("--p", p.toFixed(3));
        });
      };
      var queue = function () {
        if (!queued) {
          queued = true;
          requestAnimationFrame(update);
        }
      };
      window.addEventListener("scroll", queue, { passive: true });
      window.addEventListener("resize", queue);
      update();
    }
  }

  window.SFMotion = { sequence: sequence, ease: ease, reduced: reduce };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
