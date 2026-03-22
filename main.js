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
updateActiveNav();
window.addEventListener("scroll", scheduleScrollFrame, { passive: true });
window.addEventListener("resize", () => {
  syncSiteHeaderHeight();
  scheduleScrollFrame();
});
window.addEventListener("load", () => {
  syncSiteHeaderHeight();
  lastScrollY = window.scrollY ?? 0;
  updateActiveNav();
});

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    syncSiteHeaderHeight();
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
