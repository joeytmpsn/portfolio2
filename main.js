const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
const workEl = document.getElementById("work");
const aboutEl = document.getElementById("about");
const headerEl = document.querySelector(".site-header");

const INTERNAL_HASHES = new Set(["#overview", "#work", "#about"]);

function normalizeHash() {
  const raw = location.hash;
  if (!raw || raw === "#") {
    return "#overview";
  }
  return raw;
}

/**
 * Viewport Y of the “reading line” under the header, for scrollspy only.
 * Prefer --site-header-height (same basis as scroll-margin) so markerDoc matches hash alignment;
 * fall back to offsetHeight. Ignores is-header-hidden so toggling the bar doesn’t change section.
 */
function markerViewportY() {
  if (!headerEl) {
    return 80;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--site-header-height")
    .trim();
  const parsed = parseFloat(raw);
  const fromVar = Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
  const h = Number.isFinite(fromVar) ? fromVar : headerEl.offsetHeight;
  return Math.min(Math.max(h + 12, 56), 120);
}

const SCROLL_DIR_THRESHOLD = 6;
const HEADER_REVEAL_SCROLL_TOP = 48;
/** Treat as “at bottom” when this many px or less remain (hash scroll often stops slightly above absolute max). */
const DOCUMENT_BOTTOM_SLACK_PX = 32;
/** Hand off to About before #about top — max scroll often stops with the marker still below .work-grid’s bottom in document space. */
const ABOUT_SECTION_LEAD_PX = 168;
let lastScrollY = window.scrollY ?? 0;

function isScrolledToDocumentBottom() {
  const root = document.scrollingElement ?? document.documentElement;
  const maxY = Math.max(0, root.scrollHeight - root.clientHeight);
  if (maxY <= 0) {
    return false;
  }
  return window.scrollY >= maxY - DOCUMENT_BOTTOM_SLACK_PX;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function syncSiteHeaderHeight() {
  if (!headerEl) {
    return;
  }
  const h = Math.round(headerEl.offsetHeight);
  document.documentElement.style.setProperty("--site-header-height", `${h}px`);
}

/** Dot strip top aligns with the bottom of `.hero__eyebrow` (0px gap; all breakpoints / font load). */
function syncDotGridTop() {
  const eyebrow = document.querySelector(".hero__eyebrow");
  const wrapper = document.querySelector(".page-wrapper");
  if (!eyebrow || !wrapper) {
    return;
  }
  const gapPx = 0;
  const top = Math.round(
    eyebrow.getBoundingClientRect().bottom -
      wrapper.getBoundingClientRect().top +
      gapPx,
  );
  document.documentElement.style.setProperty(
    "--dot-grid-offset-top",
    `${Math.max(0, top)}px`,
  );
}

/** Dot strip bottom stops above `.site-footer` (measured height; wrapping / font load). */
function syncDotGridBottom() {
  const footer = document.querySelector(".site-footer");
  if (!footer) {
    return;
  }
  const h = Math.round(footer.offsetHeight);
  document.documentElement.style.setProperty(
    "--dot-grid-offset-bottom",
    `${Math.max(0, h)}px`,
  );
}

const DOT_GRID_SECTION_END_GAP_PX = 32;
const DOT_GRID_TABLET_MQ = "(max-width: 1220px)";
/** Fallback if computed background-size is unavailable (see `dotGridPatternStepPx()`). */
const DOT_GRID_PATTERN_STEP_PX = 12;

function dotGridPatternStepPx() {
  const probe = document.querySelector(".dot-grid");
  if (!probe) {
    return DOT_GRID_PATTERN_STEP_PX;
  }
  const raw = getComputedStyle(probe).backgroundSize.trim().split(/\s+/)[0];
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return DOT_GRID_PATTERN_STEP_PX;
  }
  if (raw.endsWith("rem")) {
    return Math.round(
      n * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16),
    );
  }
  return Math.round(n);
}

/** Work / About section heights drive segment ends — observe both (lazy images, copy reflow). */
function initDotGridSectionResizeHooks() {
  const workSection = document.getElementById("work");
  const aboutSection = document.getElementById("about");
  if (typeof ResizeObserver === "undefined" || (!workSection && !aboutSection)) {
    return;
  }
  let scheduled = false;
  const scheduleSync = () => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      syncDotGrid();
    });
  };
  const ro = new ResizeObserver(scheduleSync);
  if (workSection) {
    ro.observe(workSection);
    workSection.addEventListener(
      "load",
      (event) => {
        if (event.target instanceof HTMLImageElement) {
          scheduleSync();
        }
      },
      true,
    );
  }
  if (aboutSection) {
    ro.observe(aboutSection);
  }
}

function dotGridBackgroundYForTop(topPx, stepPx) {
  const step = stepPx;
  const t = Math.round(topPx);
  const phase = ((t % step) + step) % step;
  return -phase;
}

/**
 * Desktop dot strip (coordinates relative to .page-wrapper top):
 * - s0: strip start → 32px above hero bottom
 * - s1: hero bottom → 32px above `#work` section bottom (Appearances + full work section incl. padding)
 * - [32px empty]
 * - s2: `#work` bottom → 32px above `#about` section bottom (incl. padding; clamped to footer top)
 * - s3: footer top → page bottom (CSS bottom offset)
 * Pattern Y phase is aligned across segments. Tablet: one middle band + footer.
 */
function syncDotGridSegments() {
  const wrapper = document.querySelector(".page-wrapper");
  const hero = document.querySelector(".hero");
  const about = document.getElementById("about");
  const footer = document.querySelector(".site-footer");
  const root = document.documentElement;
  const segs = document.querySelectorAll("[data-dot-grid-seg]");

  if (!wrapper || !hero || segs.length < 4) {
    return;
  }

  const clearSeg = (el) => {
    el.classList.remove("is-dot-grid-visible");
    el.style.top = "";
    el.style.height = "";
    el.style.backgroundPosition = "";
  };

  if (window.matchMedia("(max-width: 760px)").matches) {
    segs.forEach(clearSeg);
    return;
  }

  const wRect = wrapper.getBoundingClientRect();
  const topStr = getComputedStyle(root).getPropertyValue("--dot-grid-offset-top").trim();
  const topPx = Math.round(parseFloat(topStr)) || 0;
  const heroBottom = Math.round(hero.getBoundingClientRect().bottom - wRect.top);

  const workSection = document.getElementById("work");
  const workSectionBottom = workSection
    ? Math.round(workSection.getBoundingClientRect().bottom - wRect.top)
    : heroBottom;

  const aboutSectionBottom = about
    ? Math.round(about.getBoundingClientRect().bottom - wRect.top)
    : workSectionBottom;

  let footerTopY;
  if (footer) {
    footerTopY = Math.round(footer.getBoundingClientRect().top - wRect.top);
  } else if (about) {
    footerTopY = aboutSectionBottom;
  } else {
    footerTopY = workSectionBottom;
  }

  const aboutStripEndExclusive = Math.min(aboutSectionBottom, footerTopY);

  const g = DOT_GRID_SECTION_END_GAP_PX;
  const tablet = window.matchMedia(DOT_GRID_TABLET_MQ).matches;
  const patternStep = dotGridPatternStepPx();

  const fillSeg = (el, top, endExclusive) => {
    const t = Math.round(top);
    const h = Math.max(0, Math.round(endExclusive - t));
    if (h <= 0) {
      clearSeg(el);
      return;
    }
    el.style.top = `${t}px`;
    el.style.height = `${h}px`;
    el.style.backgroundPosition = `0 ${dotGridBackgroundYForTop(t, patternStep)}px`;
    el.classList.add("is-dot-grid-visible");
  };

  const footerSeg = (el, top) => {
    const t = Math.round(top);
    el.style.top = `${t}px`;
    el.style.height = "";
    el.style.backgroundPosition = `0 ${dotGridBackgroundYForTop(t, patternStep)}px`;
    el.classList.add("is-dot-grid-visible");
  };

  const [s0, s1, s2, s3] = segs;

  fillSeg(s0, topPx, heroBottom - g);

  if (tablet) {
    fillSeg(s1, heroBottom, footerTopY - g);
    clearSeg(s2);
    footerSeg(s3, footerTopY);
  } else {
    fillSeg(s1, heroBottom, workSectionBottom - g);
    fillSeg(s2, workSectionBottom, aboutStripEndExclusive - g);
    footerSeg(s3, footerTopY);
  }
}

function syncDotGrid() {
  syncDotGridTop();
  syncDotGridBottom();
  syncDotGridSegments();
  document.documentElement.classList.add("is-dot-grid-synced");
}

function updateHeaderVisibility() {
  if (!headerEl) {
    return;
  }

  const y = window.scrollY ?? 0;

  if (prefersReducedMotion()) {
    headerEl.classList.remove("is-header-hidden");
    lastScrollY = y;
    return;
  }

  /* During hash smooth-scroll, hold header visible; must NOT use pendingHash alone (it can stay set when URL is #about but scrollHref is still #work). */
  if (shouldHoldHeaderVisibleForAnchorNav()) {
    headerEl.classList.remove("is-header-hidden");
    lastScrollY = y;
    return;
  }

  const delta = y - lastScrollY;

  if (y < HEADER_REVEAL_SCROLL_TOP) {
    headerEl.classList.remove("is-header-hidden");
  } else if (isScrolledToDocumentBottom()) {
    /* End of page: no “scroll down to hide” — hide on scroll up instead. */
    if (delta < -SCROLL_DIR_THRESHOLD) {
      headerEl.classList.add("is-header-hidden");
    } else if (delta > SCROLL_DIR_THRESHOLD) {
      headerEl.classList.remove("is-header-hidden");
    }
  } else if (delta > SCROLL_DIR_THRESHOLD) {
    headerEl.classList.add("is-header-hidden");
  } else if (delta < -SCROLL_DIR_THRESHOLD) {
    headerEl.classList.remove("is-header-hidden");
  }

  lastScrollY = y;
}

/**
 * Scrollspy using document Y of the marker line (scrollY + header offset).
 * Work is only active while the marker is *inside* the main work column (`.work-grid` vertical
 * span), not the whole `<section id="work">` — that section’s box often still contains the
 * marker after #about hash scroll (cards end above the marker but the section rect does not),
 * which wrongly kept “Work” active. Past the grid → About (gap, about copy, footer).
 */
function activeHrefFromScroll() {
  if (!workEl || !aboutEl) {
    return "#overview";
  }

  const y = markerViewportY();
  const scrollY =
    window.pageYOffset ??
    document.documentElement.scrollTop ??
    document.scrollingElement?.scrollTop ??
    0;
  const markerDoc = scrollY + y;

  const workTopDoc = workEl.getBoundingClientRect().top + scrollY;
  const workTailEl = workEl.querySelector(".work-grid") ?? workEl;
  const workTailBottomDoc = workTailEl.getBoundingClientRect().bottom + scrollY;
  const aboutTopDoc = aboutEl.getBoundingClientRect().top + scrollY;
  const atDocBottom = isScrolledToDocumentBottom();
  const workZoneEnd = Math.min(
    workTailBottomDoc,
    aboutTopDoc - ABOUT_SECTION_LEAD_PX,
  );

  if (markerDoc < workTopDoc) {
    return "#overview";
  }
  if (atDocBottom) {
    /* Last section is About; max scroll often cannot move the marker past .work-grid’s bottom. */
    return "#about";
  }
  if (markerDoc < workZoneEnd) {
    return "#work";
  }
  return "#about";
}

function applyNavActive(href) {
  navLinks.forEach((link) => {
    const linkHref = link.getAttribute("href");
    link.classList.toggle("is-current", linkHref === href);
  });
}

/**
 * While smooth-scrolling to an in-page hash, scroll-based state stays "overview"
 * until the target section reaches the marker — keep orange on the clicked pill until then.
 */
let pendingHash = null;
/** True only for the programmatic smooth-scroll after an internal hash click (cleared on scrollend). */
let suppressHeaderAutoHideForAnchor = false;

function shouldHoldHeaderVisibleForAnchorNav() {
  if (suppressHeaderAutoHideForAnchor) {
    return true;
  }
  /* No scrollend: fall back to pendingHash so older browsers still get a pinned header during anchor scroll. */
  if (!("onscrollend" in window) && pendingHash !== null) {
    return true;
  }
  return false;
}

function updateActiveNav() {
  if (!navLinks.length || !workEl || !aboutEl) {
    return;
  }

  const scrollHref = activeHrefFromScroll();

  if (pendingHash && scrollHref === pendingHash) {
    pendingHash = null;
  }

  const activeHref = pendingHash ?? scrollHref;
  applyNavActive(activeHref);
}

/** Pill / hash nav: keep orange + header pin in sync during smooth scroll (browser handles scroll on hashchange). */
function setInternalNavTarget(href) {
  if ("onscrollend" in window && !prefersReducedMotion()) {
    suppressHeaderAutoHideForAnchor = true;
  }
  pendingHash = href;
  applyNavActive(href);
}

window.addEventListener("hashchange", () => {
  const h = normalizeHash();
  if (!INTERNAL_HASHES.has(h)) {
    return;
  }
  setInternalNavTarget(h);
});

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const href = link.getAttribute("href");
    if (!href || !INTERNAL_HASHES.has(href)) {
      return;
    }
    event.preventDefault();
    setInternalNavTarget(href);
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  });
});

let ticking = false;
function scheduleScrollFrame() {
  if (!ticking) {
    requestAnimationFrame(() => {
      updateActiveNav();
      updateHeaderVisibility();
      ticking = false;
    });
    ticking = true;
  }
}

if (INTERNAL_HASHES.has(normalizeHash())) {
  pendingHash = normalizeHash();
}

syncSiteHeaderHeight();
syncDotGrid();
initDotGridSectionResizeHooks();
lastScrollY = window.scrollY ?? 0;
updateActiveNav();
window.addEventListener("scroll", scheduleScrollFrame, { passive: true });
window.addEventListener("resize", () => {
  syncSiteHeaderHeight();
  syncDotGrid();
  scheduleScrollFrame();
});
window.addEventListener("load", () => {
  syncSiteHeaderHeight();
  syncDotGrid();
  lastScrollY = window.scrollY ?? 0;
  updateActiveNav();
});

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    syncSiteHeaderHeight();
    syncDotGrid();
    updateActiveNav();
  });
}

if ("onscrollend" in window) {
  window.addEventListener("scrollend", () => {
    suppressHeaderAutoHideForAnchor = false;
    pendingHash = null;
    scheduleScrollFrame();
  });
}
