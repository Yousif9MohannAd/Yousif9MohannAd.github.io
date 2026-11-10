(() => {
  "use strict";
  const { gsap, ScrollTrigger, SplitText } = window;
  const page = document.documentElement;
  if (!gsap || !ScrollTrigger || !SplitText) {
    page.dataset.motionState = "static";
    return;
  }
  gsap.registerPlugin(ScrollTrigger, SplitText);
  ScrollTrigger.config({ ignoreMobileResize: true });
  const seen = new WeakSet();
  const media = gsap.matchMedia();

  media.add({ compact: "(max-width: 700px)", wide: "(min-width: 701px)", reduced: "(prefers-reduced-motion: reduce)" }, context => {
    page.dataset.motionEngine = "gsap";
    if (context.conditions.reduced) {
      page.dataset.motionState = "reduced";
      return;
    }
    const compact = context.conditions.compact;
    const entries = new Map();
    const transient = new Set();
    const listeners = [];
    const requestedToggles = new WeakSet();
    const sculpture = document.getElementById("sceneRoot");
    let refreshFrame = 0;
    let sceneObserver;
    let disposed = false;
    const listen = (target, name, handler, options) => {
      if (!target) return;
      target.addEventListener(name, handler, options);
      listeners.push(() => target.removeEventListener(name, handler, options));
    };
    const refresh = () => {
      if (!refreshFrame) refreshFrame = requestAnimationFrame(() => {
        refreshFrame = 0;
        if (!disposed) ScrollTrigger.refresh(true);
      });
    };
    const restore = entry => {
      entry.trigger?.kill();
      entry.animation?.kill();
      entry.split?.revert();
      entry.trigger = entry.animation = entry.split = null;
      if (entry.originalStyle === null) entry.element.removeAttribute("style");
      else entry.element.setAttribute("style", entry.originalStyle);
    };
    const finish = entry => {
      restore(entry);
      seen.add(entry.element);
      entry.element.dataset.textMotion = "complete";
    };
    const within = scope => entries.forEach(entry => {
      if (scope === entry.element || scope.contains(entry.element)) finish(entry);
    });
    const burst = (targets, { y = 8, stagger = .035, duration = .42 } = {}) => {
      const elements = gsap.utils.toArray(targets).filter(element => element.getClientRects().length);
      if (!elements.length) return;
      elements.forEach(element => seen.add(element));
      gsap.killTweensOf(elements);
      gsap.set(elements, { clearProps: "opacity,transform,willChange" });
      const tween = gsap.fromTo(elements, { opacity: 0, y }, {
        opacity: 1, y: 0, duration, ease: "power2.out",
        stagger: { each: stagger, amount: Math.min(.18, (elements.length - 1) * stagger) },
        overwrite: "auto", clearProps: "opacity,transform,willChange",
        onComplete: () => transient.delete(tween), onInterrupt: () => transient.delete(tween)
      });
      transient.add(tween);
    };
    const add = (element, kind = "copy", delay = 0) => {
      if (!element || entries.has(element) || !element.getClientRects().length) return;
      const entry = { element, kind, delay, originalStyle: element.getAttribute("style"), animation: null, split: null, trigger: null };
      entries.set(element, entry);
      const focused = document.activeElement?.closest("a,button,input,summary");
      if (seen.has(element) || element.getBoundingClientRect().bottom <= 0 ||
          (focused && (focused === element || focused.contains(element) || element.contains(focused)))) { finish(entry); return; }
      element.dataset.textMotion = "pending";
      gsap.set(element, { opacity: 0 });
      const play = () => {
        if (disposed || element.dataset.textMotion !== "pending") return;
        seen.add(element);
        element.dataset.textMotion = "animating";
        entry.trigger?.kill();
        entry.trigger = null;
        const complete = () => finish(entry);
        try {
          if (kind === "heading" || kind === "lines") {
            gsap.set(element, { opacity: 1 });
            entry.split = SplitText.create(element, {
              type: "lines", mask: "lines", linesClass: "motion-line", autoSplit: true, aria: "auto",
              onSplit(self) {
                const heading = kind === "heading";
                entry.animation = gsap.fromTo(self.lines, {
                  yPercent: heading ? 115 : (compact ? 38 : 50), opacity: 0
                }, {
                  yPercent: 0, opacity: 1, duration: heading ? (compact ? .72 : .92) : (compact ? .52 : .66),
                  delay, stagger: heading ? .085 : .045, ease: heading ? "power3.out" : "power2.out",
                  onComplete: complete
                });
                return entry.animation;
              }
            });
          } else {
            entry.animation = gsap.fromTo(element, { opacity: 0, y: kind === "ui" ? 0 : (compact ? 10 : 16) }, {
              opacity: 1, y: 0, duration: kind === "ui" ? .4 : .6,
              delay, ease: "power2.out", onComplete: complete
            });
          }
        } catch {
          finish(entry);
        }
      };
      const bounds = element.getBoundingClientRect();
      if (bounds.top < innerHeight * .92) play();
      else entry.trigger = ScrollTrigger.create({
        trigger: element,
        start: () => Math.max(0, Math.min(
          element.getBoundingClientRect().top + scrollY - innerHeight * (compact ? .94 : .89),
          ScrollTrigger.maxScroll(window) - 1
        )),
        once: true, onEnter: play,
        // A large jump may cross an entire element between two frames.
        onLeave: () => finish(entry)
      });
    };
    const all = (selector, kind = "copy", stagger = 0) => {
      document.querySelectorAll(selector).forEach((element, index) => add(element, kind, Math.min(.18, index * stagger)));
    };
    const cleanup = () => {
      disposed = true;
      if (refreshFrame) cancelAnimationFrame(refreshFrame);
      sceneObserver?.disconnect();
      listeners.forEach(remove => remove());
      transient.forEach(tween => tween.revert());
      entries.forEach(entry => { restore(entry); delete entry.element.dataset.textMotion; });
    };

    try {
      // The opening cadence is short; items below the fold keep their own scroll cue.
      all(".site-header .brand,.site-header .nav-links a,.header-contact,#menuBtn", "ui", .025);
      add(document.querySelector(".hero-eyebrow"), "copy", .04);
      add(document.getElementById("home-title"), "heading", .12);
      add(document.querySelector(".hero-disciplines"), "copy", .22);
      add(document.querySelector(".hero-text"), "lines", .16);
      all(".hero-actions a", "ui", .055);
      all(".focus-kicker,.focus-tabs button,#focusTitle,#focusDescription", "copy", .035);
      all(".profile-facts dt,.profile-facts dd,.scroll-cue", "copy", .025);

      all(".section-label", "copy");
      all(".display-title,#contact-title", "heading", .015);
      all(".about-text p,.section-heading > p,.lab-copy > p,.timeline-content p,.contact-eyebrow", "lines", .025);
      all(".skill-tools button,.skill-search,#skillCount,#emptySkills,.training-tabs button", "ui", .02);

      document.querySelectorAll(".capability-card").forEach((card, index) => {
        const column = compact ? 0 : index % (innerWidth <= 980 ? 2 : 3);
        add(card.querySelector(".capability-top > span"), "copy", column * .04);
        add(card.querySelector("h3"), "copy", column * .05);
        add(card.querySelector(".capability-body > p"), "copy", .055 + column * .05);
        card.querySelectorAll(".tags > span").forEach((tag, tagIndex) => add(tag, "copy", Math.min(.16, tagIndex * .025)));
        add(card.querySelector(".capability-domain"), "copy", .05);
      });
      all(".lab-tags > span", "copy", .02);
      all(".platform-card > span,.platform-card strong,.timeline-date,.timeline-content .type,.timeline-content h3", "copy", .035);
      document.querySelectorAll(".training-card").forEach(card => {
        card.querySelectorAll(".training-head > span,h3,li").forEach((element, index) => add(element, "copy", Math.min(.16, index * .025)));
      });
      all(".contact-section .button,.contact-list > *, .footer > *", "ui", .035);

      const revealControls = () => {
        if (sculpture?.dataset.sceneState !== "ready") return;
        all(".scene-controls button,.scene-coordinate", "ui", .035);
        sceneObserver?.disconnect();
      };
      if (sculpture?.dataset.sceneState === "ready") revealControls();
      else if (sculpture) {
        sceneObserver = new MutationObserver(revealControls);
        sceneObserver.observe(sculpture, { attributes: true, attributeFilter: ["data-scene-state"] });
      }
      listen(sculpture, "focuschange", () => {
        const copy = document.querySelector(".focus-copy");
        if (!copy) return;
        within(copy);
        burst(copy.children, { y: compact ? 6 : 9, stagger: .055 });
      });
      listen(document, "portfolio:menu", event => {
        const links = document.querySelectorAll(".nav-links a");
        if (event.detail.open) burst(links, { y: 8, stagger: .035, duration: .36 });
        else { gsap.killTweensOf(links); gsap.set(links, { clearProps: "opacity,transform" }); }
      });
      listen(document, "portfolio:layout", event => {
        const scope = document.querySelector(event.detail.scope);
        if (!scope) return;
        within(scope);
        if (event.detail.animate) burst(scope.querySelectorAll("article:not([hidden]) h3,article:not([hidden]) p,article:not([hidden]) li,article:not([hidden]) .tags > span"));
        refresh();
      });
      listen(document, "toggle", event => {
        if (!event.target.matches(".capability-card details")) return;
        if (!requestedToggles.has(event.target)) return;
        requestedToggles.delete(event.target);
        within(event.target);
        if (event.target.open) burst(event.target.querySelectorAll(".capability-body > p,.tags > span"), { y: 7, stagger: .025 });
        refresh();
      }, true);
      listen(document, "focusin", event => {
        const control = event.target.closest("a,button,input,summary");
        if (!control) return;
        entries.forEach(entry => {
          if (entry.element === control || entry.element.contains(control) || control.contains(entry.element)) finish(entry);
        });
        gsap.killTweensOf(control);
        gsap.set(control, { clearProps: "opacity,transform" });
      });
      listen(document, "click", event => {
        const summary = event.target.closest(".capability-card summary");
        if (summary) requestedToggles.add(summary.parentElement);
        if (event.target.closest('a[href="#main"]')) within(document.querySelector("main"));
      });
      listen(window, "pageshow", refresh);
      page.dataset.motionState = "ready";
      refresh();
      document.fonts?.ready.then(() => { if (!disposed) refresh(); });
    } catch {
      cleanup();
      page.dataset.motionState = "static";
    }
    return cleanup;
  });
})();
