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

function markerViewportY() {
  if (!headerEl) {
    return 80;
  }
  if (headerEl.classList.contains("is-header-hidden")) {
    return 32;
  }
  const h = headerEl.getBoundingClientRect().height;
  return Math.min(Math.max(h + 12, 56), 120);
}

const SCROLL_DIR_THRESHOLD = 6;
const HEADER_REVEAL_SCROLL_TOP = 48;
/** Past this scroll offset, header shows gradient fill + shadow + backdrop. */
const HEADER_SURFACE_SCROLL_TOP = 4;
/** Treat as “at bottom” when this many px or less remain (hash scroll often stops slightly above absolute max). */
const DOCUMENT_BOTTOM_SLACK_PX = 32;
/** Nudge About’s scrollspy boundary upward so hash / scroll-margin land reads as About, not Work. */
const ABOUT_SCROLLSPY_LEAD_PX = 52;

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

function updateHeaderScrolledSurface() {
  if (!headerEl) {
    return;
  }
  const y = window.scrollY ?? 0;
  headerEl.classList.toggle("is-header-scrolled", y > HEADER_SURFACE_SCROLL_TOP);
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
 * Classic scrollspy: document Y of the marker line vs section tops (About after Work in the DOM).
 * Handles gaps (marker between sections → Work), footer (marker past About → About), and avoids
 * viewport-rect checks that fail when a long section is mostly off-screen.
 */
function activeHrefFromScroll() {
  if (!workEl || !aboutEl) {
    return "#overview";
  }

  const y = markerViewportY();
  const scrollY = window.scrollY;
  const markerDoc = scrollY + y;
  const workTopDoc = workEl.getBoundingClientRect().top + scrollY;
  const aboutTopDoc = aboutEl.getBoundingClientRect().top + scrollY;
  const aboutActivateDoc = aboutTopDoc - ABOUT_SCROLLSPY_LEAD_PX;

  if (markerDoc >= aboutActivateDoc) {
    return "#about";
  }
  if (markerDoc >= workTopDoc) {
    return "#work";
  }
  return "#overview";
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

window.addEventListener("hashchange", () => {
  const h = normalizeHash();
  if (!INTERNAL_HASHES.has(h)) {
    return;
  }
  if ("onscrollend" in window && !prefersReducedMotion()) {
    suppressHeaderAutoHideForAnchor = true;
  }
  pendingHash = h;
  applyNavActive(h);
});

let ticking = false;
function scheduleScrollFrame() {
  if (!ticking) {
    requestAnimationFrame(() => {
      updateHeaderScrolledSurface();
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
lastScrollY = window.scrollY ?? 0;
updateHeaderScrolledSurface();
updateActiveNav();
window.addEventListener("scroll", scheduleScrollFrame, { passive: true });
window.addEventListener("resize", () => {
  syncSiteHeaderHeight();
  scheduleScrollFrame();
});
window.addEventListener("load", () => {
  syncSiteHeaderHeight();
  lastScrollY = window.scrollY ?? 0;
  updateHeaderScrolledSurface();
  updateActiveNav();
});

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    syncSiteHeaderHeight();
    updateHeaderScrolledSurface();
    updateActiveNav();
  });
}

if ("onscrollend" in window) {
  window.addEventListener("scrollend", () => {
    suppressHeaderAutoHideForAnchor = false;
    /* Drop pending so the pill follows scrollHref after the hash scroll finishes; otherwise
       pending stays #about while scrollHref is #work/#overview and About looks “stuck”. */
    pendingHash = null;
    scheduleScrollFrame();
  });
}
