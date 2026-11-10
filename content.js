(() => {
  "use strict";
  const renderer = window.YousifContent;
  let fallback;
  try { fallback = renderer.validate(JSON.parse(document.getElementById("site-data").textContent)); }
  catch { document.documentElement.dataset.contentState = "fallback"; window.portfolioReady = Promise.resolve(); return; }
  window.portfolioContent = fallback;
  window.portfolioReady = (async () => {
    let data = fallback;
    try {
      const response = await fetch("content.json", { cache:"no-cache", signal:AbortSignal.timeout(3500) });
      if (response.ok) data = renderer.validate(await response.json());
    } catch { /* The statically rendered profile remains available. */ }
    window.portfolioContent = data;
    if (JSON.stringify(data) !== JSON.stringify(fallback)) {
      document.querySelector(".site-header").outerHTML = renderer.header(data);
      document.querySelector("main").outerHTML = renderer.main(data);
      document.querySelector("footer").outerHTML = renderer.footer(data);
    }
    const meta = renderer.metadata(data);
    document.title = meta.title;
    document.querySelector('meta[name="description"]').content = meta.description;
    document.querySelector('link[rel="canonical"]').href = meta.canonical;
    document.getElementById("site-schema").textContent = JSON.stringify(meta.structured);
    document.documentElement.dataset.contentState = "ready";
    document.dispatchEvent(new CustomEvent("portfolio:content-ready"));
    return data;
  })();
})();
