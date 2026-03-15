const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
const observedSections = ["overview", "about"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);

if ("IntersectionObserver" in window && navLinks.length && observedSections.length) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) {
        return;
      }

      const currentId = `#${visible.target.id}`;
      navLinks.forEach((link) => {
        link.classList.toggle("is-current", link.getAttribute("href") === currentId);
      });
    },
    {
      rootMargin: "-30% 0px -45%",
      threshold: [0.2, 0.4, 0.6],
    }
  );

  observedSections.forEach((section) => navObserver.observe(section));
}
