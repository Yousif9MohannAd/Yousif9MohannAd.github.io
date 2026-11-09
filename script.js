"use strict";

const header = document.querySelector(".site-header");
const menuBtn = document.getElementById("menuBtn");
const navLinks = document.getElementById("navLinks");
const mobile = window.matchMedia("(max-width: 1024px)");

if (menuBtn && navLinks) {
  const label = menuBtn.querySelector(".menu-label");
  const setMenu = (open, returnFocus = false) => {
    const expanded = open && mobile.matches;
    navLinks.classList.toggle("open", expanded);
    menuBtn.setAttribute("aria-expanded", String(expanded));
    menuBtn.setAttribute("aria-label", expanded ? "Close menu" : "Open menu");
    if (label) label.textContent = expanded ? "Close" : "Menu";
    if (returnFocus) menuBtn.focus();
  };

  menuBtn.addEventListener("click", () => {
    setMenu(menuBtn.getAttribute("aria-expanded") !== "true");
  });
  header?.addEventListener("click", event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    setMenu(false);
    document.getElementById(link.hash.slice(1))?.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") setMenu(false, true);
  });
  document.addEventListener("click", event => {
    if (!header?.contains(event.target) && menuBtn.getAttribute("aria-expanded") === "true") {
      setMenu(false, navLinks.contains(document.activeElement));
    }
  });
  // This is a disclosure: Tab moves naturally into the rest of the page.
  header?.addEventListener("focusout", event => {
    if (!header.contains(event.relatedTarget)) setMenu(false);
  });
  mobile.addEventListener("change", () => {
    setMenu(false, mobile.matches && navLinks.contains(document.activeElement));
    if (!mobile.matches && document.activeElement === menuBtn) {
      (navLinks.querySelector('[aria-current="location"]') || navLinks.querySelector("a"))?.focus();
    }
  });
  document.documentElement.classList.add("js-menu");
}

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

// Scroll tracking also works when IntersectionObserver is unavailable.
const navigation = [...document.querySelectorAll('.nav a[href^="#"]')];
const sections = [...document.querySelectorAll("main > section[id]")];
let currentId = "";
let scrollPending = false;

const updateNavigation = () => {
  scrollPending = false;
  const activationLine = (mobile.matches ? (header?.getBoundingClientRect().height || 72) : 0) + 64;
  let active = sections[0]?.id;
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= activationLine) active = section.id;
  }
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) active = sections.at(-1)?.id;
  if (!active || active === currentId) return;
  currentId = active;
  for (const link of navigation) {
    if (link.hash === `#${active}`) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
};
const scheduleNavigation = () => {
  if (scrollPending) return;
  scrollPending = true;
  window.requestAnimationFrame(updateNavigation);
};
window.addEventListener("scroll", scheduleNavigation, { passive: true });
window.addEventListener("resize", scheduleNavigation);
window.addEventListener("hashchange", scheduleNavigation);
window.addEventListener("pageshow", scheduleNavigation);
updateNavigation();
