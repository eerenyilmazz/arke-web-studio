/*
 * Arke Web Studio kit (provided by the factory; do not rewrite it). Load it on every page:
 *   <script src="/js/kit.js" defer></script>
 * Two tested parts, so no site hand-rolls them:
 *   - Theme toggle: <button type="button" class="theme-toggle" data-theme-toggle data-label-dark="…" data-label-light="…">
 *     with the two icons inside (see rules/custom-site.md). Remembers the choice; otherwise follows the system.
 *   - Phone menu: <button type="button" class="nav-toggle" data-nav-toggle aria-controls="site-nav" aria-expanded="false">
 *     and <nav id="site-nav" data-nav>. Below 48rem the nav folds into the button; Escape or a link closes it.
 */
(function () {
  var KEY = "theme";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function stored() {
    try {
      var t = localStorage.getItem(KEY);
      return t === "light" || t === "dark" ? t : null;
    } catch (e) {
      return null; // private mode: follow the system
    }
  }
  function current() {
    return root.dataset.theme || stored() || (media && media.matches ? "dark" : "light");
  }
  function paint() {
    var dark = current() === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(dark));
      // The label says what a press does: switch to the other theme.
      var label = dark ? btn.getAttribute("data-label-light") : btn.getAttribute("data-label-dark");
      if (label) btn.setAttribute("aria-label", label);
    });
  }
  var saved = stored();
  if (saved) root.dataset.theme = saved;
  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch (e) {
        /* not remembered in private mode */
      }
      paint();
    });
  });
  if (media && media.addEventListener) media.addEventListener("change", paint);
  paint();

  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      nav.toggleAttribute("data-nav-open", open);
    };
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }
})();
