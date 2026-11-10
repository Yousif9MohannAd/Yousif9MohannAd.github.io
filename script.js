(() => {
  "use strict";
  const header = document.querySelector(".site-header");
  const menuBtn = document.getElementById("menuBtn");
  const nav = document.getElementById("navLinks");
  const mobile = matchMedia("(max-width: 980px)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (menuBtn && nav) {
    const setMenu = (value, focus = false) => {
      const open = value && mobile.matches;
      const changed = menuBtn.getAttribute("aria-expanded") !== String(open);
      nav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menuBtn.querySelector(".menu-label").textContent = open ? "Close" : "Menu";
      if (focus) menuBtn.focus();
      if (changed) document.dispatchEvent(new CustomEvent("portfolio:menu", { detail: { open } }));
    };
    menuBtn.addEventListener("click", () => setMenu(menuBtn.getAttribute("aria-expanded") !== "true"));
    header.addEventListener("click", event => { if (event.target.closest('a[href^="#"]')) setMenu(false); });
    header.addEventListener("focusout", event => { if (!header.contains(event.relatedTarget)) setMenu(false); });
    document.addEventListener("click", event => { if (!header.contains(event.target) && menuBtn.getAttribute("aria-expanded") === "true") setMenu(false, nav.contains(document.activeElement)); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") setMenu(false, true); });
    mobile.addEventListener("change", () => {
      setMenu(false, mobile.matches && nav.contains(document.activeElement));
      if (!mobile.matches && document.activeElement === menuBtn) (nav.querySelector('[aria-current="location"]') || nav.querySelector("a"))?.focus();
    });
    document.documentElement.classList.add("js-menu");
  }

  const cards = [...document.querySelectorAll(".capability-card")];
  const scene = document.getElementById("sceneRoot");
  const focusButtons = [...document.querySelectorAll(".focus-tabs button")];
  const focusSource = {
    defense: cards.find(card => card.dataset.category === "defense"),
    offense: cards.find(card => card.dataset.category === "offense"),
    research: cards.find(card => card.dataset.category === "research")
  };
  const focusContent = Object.fromEntries(Object.entries(focusSource).map(([focus, card]) => [focus, card && {
    title: card.querySelector("h3").textContent,
    description: card.querySelector(".capability-body p").textContent
  }]));
  focusButtons.forEach(button => button.addEventListener("click", () => {
    const focus = button.dataset.focus;
    const copy = focusContent[focus];
    if (!copy || !scene) return;
    focusButtons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    document.getElementById("focusTitle").textContent = copy.title;
    document.getElementById("focusDescription").textContent = copy.description;
    scene.dataset.focus = focus;
    scene.dispatchEvent(new CustomEvent("focuschange", { detail: focus }));
  }));

  let skillFilter = "all";
  const search = document.getElementById("skillSearch");
  const skillFilters = [...document.querySelectorAll("[data-skill-filter]")];
  const index = new Map(cards.map(card => [card, card.textContent.toLocaleLowerCase()]));
  const filterSkills = (animate = false) => {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    cards.forEach(card => {
      const show = (skillFilter === "all" || card.dataset.category === skillFilter) && index.get(card).includes(query);
      card.hidden = !show;
      if (show) count++;
    });
    document.getElementById("skillCount").textContent = count + (count === 1 ? " capability" : " capabilities");
    document.getElementById("emptySkills").hidden = count !== 0;
    document.dispatchEvent(new CustomEvent("portfolio:layout", { detail: { scope: "#capabilityGrid", animate } }));
  };
  skillFilters.forEach(button => button.addEventListener("click", () => {
    skillFilter = button.dataset.skillFilter;
    skillFilters.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    filterSkills(true);
  }));
  search?.addEventListener("input", () => filterSkills());
  const trainingFilters = [...document.querySelectorAll("[data-training-filter]")];
  trainingFilters.forEach(button => button.addEventListener("click", () => {
    trainingFilters.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    document.querySelectorAll(".training-card").forEach(card => { card.hidden = button.dataset.trainingFilter !== "all" && card.dataset.training !== button.dataset.trainingFilter; });
    document.dispatchEvent(new CustomEvent("portfolio:layout", { detail: { scope: ".training-grid", animate: true } }));
  }));

  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  document.querySelectorAll(".tilt-card").forEach(card => {
    let pending = 0, x = 0, y = 0;
    const reset = () => { if (pending) cancelAnimationFrame(pending); pending = 0; card.style.removeProperty("--tilt-x"); card.style.removeProperty("--tilt-y"); };
    card.addEventListener("pointermove", event => {
      if (reduced.matches || !finePointer.matches || event.pointerType !== "mouse") return;
      x = event.clientX; y = event.clientY;
      if (!pending) pending = requestAnimationFrame(() => {
        pending = 0;
        const bounds = card.getBoundingClientRect();
        const horizontal = (x - bounds.left) / bounds.width;
        const vertical = (y - bounds.top) / bounds.height;
        card.style.setProperty("--tilt-x", ((.5 - vertical) * 6).toFixed(2) + "deg");
        card.style.setProperty("--tilt-y", ((horizontal - .5) * 8).toFixed(2) + "deg");
        card.style.setProperty("--mouse-x", (horizontal * 100).toFixed(1) + "%");
        card.style.setProperty("--mouse-y", (vertical * 100).toFixed(1) + "%");
      });
    }, { passive: true });
    card.addEventListener("pointerleave", reset);
    reduced.addEventListener("change", reset);
  });
  document.querySelectorAll(".magnetic").forEach(link => {
    link.addEventListener("pointermove", event => {
      if (reduced.matches || !finePointer.matches || event.pointerType !== "mouse") return;
      const bounds = link.getBoundingClientRect();
      link.style.setProperty("--magnet-x", ((event.clientX - bounds.left - bounds.width / 2) * .08).toFixed(1) + "px");
      link.style.setProperty("--magnet-y", ((event.clientY - bounds.top - bounds.height / 2) * .12).toFixed(1) + "px");
    }, { passive: true });
    link.addEventListener("pointerleave", () => { link.style.removeProperty("--magnet-x"); link.style.removeProperty("--magnet-y"); });
  });

  document.addEventListener("click", event => {
    const link = event.target.closest('a[href^="#"]');
    const target = link && document.getElementById(link.hash.slice(1));
    if (!target) return;
    target.focus({ preventScroll: true });
  });
  const sections = [...document.querySelectorAll("main > section[id]")];
  const navigation = [...document.querySelectorAll('.site-header a[href^="#"]')];
  const progress = document.querySelector(".reading-progress > span");
  let queued = false, current = "";
  const updateNavigation = () => {
    queued = false;
    const activationLine = (header?.getBoundingClientRect().height || 82) + 80;
    let active = sections[0]?.id;
    for (const section of sections) if (section.getBoundingClientRect().top <= activationLine) active = section.id;
    const distance = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    progress.style.transform = "scaleX(" + Math.max(0, Math.min(1, scrollY / distance)) + ")";
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 4) active = sections.at(-1)?.id;
    if (!active || active === current) return;
    current = active;
    navigation.forEach(link => { if (link.hash === "#" + active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current"); });
  };
  const queueNavigation = () => { if (!queued) { queued = true; requestAnimationFrame(updateNavigation); } };
  addEventListener("scroll", queueNavigation, { passive: true });
  addEventListener("resize", queueNavigation);
  addEventListener("hashchange", queueNavigation);
  addEventListener("pageshow", queueNavigation);
  const year = document.getElementById("year"); if (year) year.textContent = String(new Date().getFullYear());
  document.documentElement.classList.add("js");
  updateNavigation();
})();
