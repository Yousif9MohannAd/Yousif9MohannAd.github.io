(() => {
  'use strict';
  const categories = [ ['all', 'All reports'], ['ai-security', 'AI Security'], ['vulnerabilities', 'Vulnerabilities'] ];
  const categoryNames = { security: 'Security', 'ai-security': 'AI Security', vulnerabilities: 'Vulnerability' };
  const wordLimit = value => {
    const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ');
    return words.slice(0, 12).join(' ') + (words.length > 12 ? '…' : '');
  };
  const text = (value, limit = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const key = value => text(value).normalize('NFKC').replace(/[’‘]/g, "'").toLocaleLowerCase('en');
  const href = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
    catch { return null; }
  };
  const validDate = value => value && Number.isFinite(new Date(value).getTime());
  const stamp = value => validDate(value) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value)) + ' UTC' : 'Date unavailable';
  const day = value => validDate(value) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : 'Date unavailable';
  const make = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const button = (label, className = 'obs-button') => {
    const node = make('button', className, label);
    node.type = 'button';
    return node;
  };
  const category = value => {
    const label = key(value).replace(/[ _]/g, '-');
    return /^(ai|ai-security|artificial-intelligence)$/.test(label) ? 'ai-security' : /^(vulnerability|vulnerabilities|advisory|cve)$/.test(label) ? 'vulnerabilities' : 'security';
  };
  const normaliseArticle = article => {
    if (!article || !href(article.url) || !text(article.title) || !validDate(article.publishedAt)) return null;
    const url = href(article.url);
    return { id: text(article.id || url), title: wordLimit(text(article.title, 600)), url, publisher: text(article.publisher || new URL(url).hostname, 100), publishedAt: new Date(article.publishedAt).toISOString(), category: category(article.category), countries: Array.isArray(article.countries) ? article.countries.slice(0, 30).map(value => text(value, 100)) : [], dateKind: ['indexed', 'added'].includes(article.dateKind) ? article.dateKind : 'published' };
  };
  const normalisePayload = (payload, saved = false, selectedCountry = null) => {
    const seen = new Set(), counts = new Map();
    const articles = [...(Array.isArray(payload?.articles) ? payload.articles : []), ...(Array.isArray(payload?.advisories) ? payload.advisories : [])]
      .slice(0, 200).map(normaliseArticle).filter(Boolean).filter(article => !selectedCountry || article.countries.some(value => key(value) === key(selectedCountry.name) || key(value) === key(selectedCountry.id)))
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).filter(article => {
        const publisher = key(article.publisher), count = counts.get(publisher) || 0;
        if (seen.has(article.url) || count >= 2) return false;
        seen.add(article.url); counts.set(publisher, count + 1); return true;
      });
    return {
      status: saved ? 'saved' : ['fresh', 'partial', 'empty', 'unavailable'].includes(payload?.status) ? payload.status : 'unavailable',
      saved, cached: Boolean(payload?.cached), generatedAt: validDate(payload?.generatedAt) ? payload.generatedAt : null,
      fetchedAt: validDate(payload?.fetchedAt) ? payload.fetchedAt : (validDate(payload?.generatedAt) ? payload.generatedAt : null), articles,
      sources: (Array.isArray(payload?.sources) ? payload.sources : []).slice(0, 15).map(source => ({ name: text(source.name, 100), url: href(source.url), updatedAt: validDate(source.updatedAt) ? source.updatedAt : null, status: ['ok', 'available', 'fresh'].includes(source.status) ? 'ok' : 'unavailable' }))
    };
  };

  async function start() {
    if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    try { await window.portfolioReady; } catch { /* Static profile content remains usable. */ }
    const app = document.getElementById('intelligenceApp');
    if (!app) return;
    const sectionTitle = document.getElementById('intelligence-title');
    app.classList.add('security-observatory');
    const state = { countries: [], selected: null, category: 'all', payload: null, loading: false, limit: 6, request: 0, controller: null, mapController: null, mapFailed: false };
    let snapshotPromise;
    const paths = new Map();
    const header = make('div', 'obs-heading');
    const headingCopy = make('div');
    headingCopy.append(make('p', 'obs-eyebrow', 'PUBLIC INTELLIGENCE / FIELD NOTES'));
    const title = make('h2', 'obs-title', 'Security Observatory'); title.id = 'observatory-title';
    headingCopy.append(title, make('p', 'obs-intro', 'Explore dated reporting on cybersecurity, vulnerabilities and AI security.'));
    const refreshButton = button('Refresh sources', 'obs-button obs-refresh');
    if (sectionTitle) { header.classList.add('obs-toolbar'); header.append(refreshButton); }
    else header.append(headingCopy, refreshButton);
    const layout = make('div', 'obs-layout');
    const mapPanel = make('div', 'obs-map-panel');
    const mapTop = make('div', 'obs-map-top');
    mapTop.append(make('h3', '', 'Country news coverage'), make('span', 'obs-map-type', 'PUBLIC REPORTS'));
    const mapStage = make('div', 'obs-map-stage');
    const mapLoading = make('p', 'obs-map-message', 'Loading country map…'); mapStage.append(mapLoading);
    const mapHover = make('p', 'obs-map-hover', 'Choose a country'); mapHover.setAttribute('aria-hidden', 'true'); mapStage.append(mapHover);
    const controls = make('div', 'obs-country-controls');
    const searchLabel = make('label', 'obs-field'); searchLabel.append(make('span', '', 'Find a country'));
    const search = make('input', 'obs-country-search'); search.type = 'search'; search.placeholder = 'Search countries'; search.autocomplete = 'off'; searchLabel.append(search);
    const selectLabel = make('label', 'obs-field'); selectLabel.append(make('span', '', 'Country selector'));
    const select = make('select', 'obs-country-select'); select.setAttribute('aria-describedby', 'observatory-map-note'); selectLabel.append(select);
    const globalButton = button('Global reporting', 'obs-button obs-global'); globalButton.setAttribute('aria-pressed', 'true');
    controls.append(searchLabel, selectLabel, globalButton);
    const mapNote = make('p', 'obs-map-note', 'Country matches come from public reporting. Map locations do not represent live attack sensors.'); mapNote.id = 'observatory-map-note';
    mapPanel.append(mapTop, mapStage, controls, mapNote);
    const newsPanel = make('div', 'obs-news-panel');
    const newsTop = make('div', 'obs-news-top');
    const newsTitle = make('h3', '', 'Global reporting');
    const statusBadge = make('span', 'obs-status-badge', 'Checking sources');
    newsTop.append(newsTitle, statusBadge);
    const tabs = make('div', 'obs-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Filter security reports');
    const tabButtons = new Map();
    categories.forEach(([value, label]) => {
      const control = button(label, 'obs-tab'); control.dataset.observatoryCategory = value;
      control.setAttribute('aria-pressed', String(value === 'all'));
      control.addEventListener('click', () => { state.category = value; state.limit = 6; renderReports(); });
      tabs.append(control); tabButtons.set(value, control);
    });
    const status = make('p', 'obs-update-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const grid = make('div', 'obs-news-grid'); grid.setAttribute('aria-label', 'Security reports');
    const more = button('Show more reports', 'obs-button obs-more'); more.hidden = true;
    more.addEventListener('click', () => { state.limit += 6; renderReports(); });
    const sources = make('details', 'obs-sources'); sources.append(make('summary', '', 'Sources & update status'));
    const sourcesList = make('ul'); sources.append(sourcesList);
    newsPanel.append(newsTop, tabs, status, grid, more, sources);
    layout.append(mapPanel, newsPanel);
    app.replaceChildren(header, layout);
    document.getElementById('intelligence')?.setAttribute('aria-labelledby', sectionTitle?.id || title.id);

    function changed() {
      app.dataset.observatoryState = state.loading ? 'loading' : (state.payload?.status || 'unavailable');
      app.dataset.observatoryCountry = state.selected?.name || 'global';
      app.dataset.observatoryCategory = state.category;
      document.dispatchEvent(new CustomEvent('portfolio:layout', { detail: { scope: '#intelligenceApp', animate: false } }));
      document.dispatchEvent(new CustomEvent('portfolio:intelligence-updated', { detail: { country: state.selected?.name || null, category: state.category, status: app.dataset.observatoryState, count: grid.querySelectorAll('.obs-card').length } }));
    }

    function countryMatches(article, country = state.selected) {
      return !country || article.countries.some(value => key(value) === key(country.name) || key(value) === key(country.id));
    }

    function countryOptions() {
      const query = key(search.value);
      const options = [new Option('Global reporting', '')];
      state.countries.filter(country => !query || key(country.name).includes(query) || country.id === state.selected?.id)
        .forEach(country => options.push(new Option(country.name, country.id)));
      select.replaceChildren(...options);
      select.value = state.selected?.id || '';
      select.disabled = state.countries.length === 0;
    }

    function setCountry(country) {
      state.selected = country; state.limit = 6; search.value = '';
      countryOptions();
      paths.forEach((path, id) => path.classList.toggle('is-selected', id === country?.id));
      globalButton.setAttribute('aria-pressed', String(!country));
      mapHover.textContent = country?.name || 'Choose a country';
      loadReports();
    }
    search.addEventListener('input', countryOptions);
    select.addEventListener('change', () => setCountry(state.countries.find(country => country.id === select.value) || null));
    globalButton.addEventListener('click', () => setCountry(null));
    refreshButton.addEventListener('click', () => { if (state.mapFailed) loadMap(); snapshotPromise = null; loadReports(); });

    function empty(title, message, retry = false) {
      const panel = make('div', 'obs-empty');
      panel.append(make('h4', '', title), make('p', '', message));
      if (retry) { const control = button('Try again'); control.addEventListener('click', loadReports); panel.append(control); }
      if (state.selected) { const control = button('Explore global reporting', 'obs-text-button'); control.addEventListener('click', () => setCountry(null)); panel.append(control); }
      return panel;
    }

    function renderReports() {
      newsTitle.textContent = state.selected ? 'Reports mentioning ' + state.selected.name : 'Global reporting';
      tabButtons.forEach((control, value) => control.setAttribute('aria-pressed', String(value === state.category)));
      refreshButton.disabled = state.loading;
      refreshButton.textContent = state.loading ? 'Checking sources…' : 'Refresh sources';
      grid.setAttribute('aria-busy', String(state.loading));
      grid.replaceChildren(); sourcesList.replaceChildren(); more.hidden = true;
      if (state.loading) {
        statusBadge.textContent = 'Checking sources'; statusBadge.dataset.state = 'loading';
        status.textContent = state.selected ? 'Checking reports for ' + state.selected.name + '…' : 'Checking public sources…';
        grid.append(empty('Gathering reports', 'Titles, source links and dates will appear here.'));
        changed(); return;
      }
      const payload = state.payload;
      if (!payload || payload.status === 'unavailable') {
        statusBadge.textContent = 'Unavailable'; statusBadge.dataset.state = 'unavailable';
        status.textContent = 'The selected coverage is temporarily unavailable.';
        grid.append(empty('Coverage unavailable', state.selected ? 'Country reporting could not be checked. Try again or explore global sources.' : 'Public sources could not be checked, and no saved reporting is available.', true));
      } else {
        const matched = payload.articles.filter(article => countryMatches(article) && (state.category === 'all' || article.category === state.category));
        statusBadge.textContent = payload.saved ? 'Saved reporting' : payload.status === 'partial' ? 'Partial update' : payload.cached ? 'Cached update' : 'Source check complete';
        statusBadge.dataset.state = payload.saved ? 'saved' : payload.status;
        const origin = payload.saved ? 'Saved snapshot: ' : 'Source check: ';
        status.textContent = matched.length + (matched.length === 1 ? ' report · ' : ' reports · ') + origin + stamp(payload.saved ? payload.generatedAt : payload.fetchedAt);
        matched.slice(0, state.limit).forEach(article => {
          const card = make('article', 'obs-card'); card.dataset.observatoryReport = article.id;
          const meta = make('div', 'obs-card-meta');
          meta.append(make('span', 'obs-publisher', article.publisher), make('span', 'obs-category', categoryNames[article.category]));
          const heading = make('h4'); const link = make('a', '', article.title); link.href = article.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
          const arrow = make('span', 'obs-external', '↗'); arrow.setAttribute('aria-hidden', 'true'); link.append(arrow); heading.append(link);
          const date = make('p', 'obs-card-date', (article.dateKind === 'indexed' ? 'Indexed ' : article.dateKind === 'added' ? 'Added ' : 'Published '));
          const time = make('time', '', day(article.publishedAt)); time.dateTime = article.publishedAt; date.append(time);
          card.append(meta, heading, date); grid.append(card);
        });
        if (!matched.length) grid.append(empty('No matching reports', state.selected ? 'No matching reports were returned for this country and category in the source window.' : 'No reports in this update match the selected category. Try All reports.'));
        more.hidden = matched.length <= state.limit;
      }
      (payload?.sources || []).forEach(source => {
        const row = make('li');
        const label = source.url ? make('a', '', source.name) : make('span', '', source.name);
        if (source.url) { label.href = source.url; label.target = '_blank'; label.rel = 'noopener noreferrer'; }
        row.append(label, make('span', '', source.status === 'ok' ? source.updatedAt ? 'Latest item: ' + day(source.updatedAt) : 'Source checked' : 'Unavailable at last check'));
        sourcesList.append(row);
      });
      sources.hidden = sourcesList.children.length === 0;
      changed();
    }

    async function snapshot() {
      if (!snapshotPromise) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        snapshotPromise = fetch(new URL('data/news-snapshot.json', document.baseURI), { cache: 'no-cache', signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error('No saved reporting'); return response.json(); })
        .catch(() => null).finally(() => clearTimeout(timer));
      }
      return snapshotPromise;
    }

    async function loadReports() {
      const request = ++state.request;
      state.controller?.abort();
      const controller = new AbortController(); state.controller = controller;
      const country = state.selected;
      state.loading = true; renderReports();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let payload;
      try {
        const url = new URL('api/intelligence', document.baseURI);
        if (country) url.searchParams.set('country', country.name);
        const response = await fetch(url, { signal: controller.signal, cache: 'no-cache', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Source endpoint unavailable');
        payload = normalisePayload(await response.json(), false, country);
        if (payload.status === 'unavailable') throw new Error('Coverage unavailable');
        if (country) payload.articles = payload.articles.filter(article => countryMatches(article, country));
      } catch {
        if (request !== state.request) return;
        const savedRaw = await snapshot();
        const saved = savedRaw ? normalisePayload(savedRaw, true, country) : null;
        const articles = saved?.articles.filter(article => countryMatches(article, country)) || [];
        payload = saved && articles.length ? { ...saved, articles } : { status: 'unavailable', articles: [], sources: [] };
      } finally { clearTimeout(timeout); }
      if (request !== state.request) return;
      state.payload = payload; state.loading = false; renderReports();
    }

    async function loadMap() {
      const controller = new AbortController(); state.mapController = controller;
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(new URL('data/world-map.json', document.baseURI), { cache: 'force-cache', signal: controller.signal });
        if (!response.ok) throw new Error('Map unavailable');
        const map = await response.json();
        if (!Array.isArray(map.countries) || map.countries.length > 300) throw new Error('Invalid map');
        const countryIds = new Set();
        state.countries = map.countries.filter(country => typeof country.name === 'string' && typeof country.path === 'string' && country.path.length < 200_000 && /^[AaCcHhLlMmQqSsTtVvZz0-9eE+.,\-\s]+$/.test(country.path))
          .map(country => {
            const name = text(country.name, 100);
            let id = country.id === undefined || country.id === null ? 'name:' + name : String(country.id);
            if (!id || id === 'undefined' || countryIds.has(id)) id = 'name:' + name;
            countryIds.add(id);
            return { id, name, path: country.path };
          }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
        if (!state.countries.length) throw new Error('Empty map');
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 1000 500'); svg.setAttribute('class', 'obs-world-map'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'World map for country news selection. Use the country selector for keyboard access.');
        paths.clear();
        state.countries.forEach(country => {
          const path = document.createElementNS(ns, 'path'); path.setAttribute('d', country.path); path.setAttribute('class', 'obs-country'); path.setAttribute('vector-effect', 'non-scaling-stroke');
          path.dataset.countryId = country.id; path.setAttribute('aria-hidden', 'true');
          if (state.selected?.id === country.id) path.classList.add('is-selected');
          const label = document.createElementNS(ns, 'title'); label.textContent = country.name; path.append(label);
          path.addEventListener('click', () => setCountry(country));
          path.addEventListener('pointerenter', () => { mapHover.textContent = country.name; });
          path.addEventListener('pointerleave', () => { mapHover.textContent = state.selected?.name || 'Choose a country'; });
          svg.append(path); paths.set(country.id, path);
        });
        mapStage.querySelector('svg')?.remove(); mapStage.prepend(svg); mapLoading.hidden = true; state.mapFailed = false;
        countryOptions(); changed();
      } catch {
        state.mapFailed = true; mapLoading.hidden = false;
        mapLoading.textContent = 'The map is unavailable. Global reports are still available.';
        countryOptions();
      } finally { clearTimeout(timeout); }
    }

    countryOptions();
    window.addEventListener('pagehide', () => { state.controller?.abort(); state.mapController?.abort(); }, { once: true });
    await Promise.allSettled([loadMap(), loadReports()]);
  }
  start().catch(() => {
    const app = document.getElementById('intelligenceApp');
    if (app) { app.dataset.observatoryState = 'unavailable'; app.replaceChildren(make('p', 'obs-unavailable', 'Security reporting is temporarily unavailable.')); }
  });
})();
