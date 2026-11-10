(() => {
  "use strict";
  const STORAGE_KEY = "yousif.j0.studio.draft.v1";
  const MAX_BYTES = 248 * 1024;
  const MAX_FILE_BYTES = 250 * 1024;
  const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
  const BUILT_IN_SECTIONS = ["home", "about", "skills", "learning", "labs", "experience", "certificates", "intelligence", "contact"];
  const FIXED_DOM_IDS = new Set(["main", "year", "site-data", "site-schema", "observatory-title", "observatory-map-note"]);
  const BUILT_IN_HEADINGS = new Set(BUILT_IN_SECTIONS.map(id => `${id}-title`));
  const PROFILE_FIELDS = ["brand", "name", "role", "summary", "disciplines", "about", "location", "email", "github", "linkedinHandle", "focus", "education", "availability"];
  const subscribers = new Set();
  const state = { document: null, baseline: null, revision: null, savedAt: null, dirty: false, conflict: false, busy: false, initialized: false, storageBlocked: false, storageAvailable: true, cached: null, publisher: null, publisherReady: false, loadGeneration: 0, selectedTab: "profile", removed: null, resetAction: "baseline", connection: { state: "loading" } };
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const isRecord = value => !!value && typeof value === "object" && !Array.isArray(value);
  const same = (a, b) => {
    const canonical = value => Array.isArray(value) ? value.map(canonical) : isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  };

  function validateDocument(value, { draft = false } = {}) {
    const errors = [];
    const add = (path, message) => { if (errors.length < 24) errors.push({ path, message }); };
    const text = (input, path, max, required = false) => {
      if (typeof input !== "string") add(path, "must be text");
      else if (input.length > (draft ? 12000 : max)) add(path, `must be ${draft ? 12000 : max} characters or fewer`);
      else if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input)) add(path, "contains unsupported control characters");
      else if (required && !draft && !input.trim()) add(path, "cannot be empty");
    };
    const list = (input, path, max) => {
      if (!Array.isArray(input)) { add(path, "must be a list"); return []; }
      if (input.length > max) add(path, `cannot contain more than ${max} items`);
      return input.slice(0, max);
    };
    if (!isRecord(value)) return [{ path: "content", message: "must be a JSON object" }];
    let nodes = 0;
    const visited = new WeakSet();
    function inspect(input, path, depth) {
      if (++nodes > 12000) { if (nodes === 12001) add(path, "contains too many values"); return; }
      if (depth > 16) { add(path, "is nested too deeply"); return; }
      if (input === null || typeof input === "boolean") return;
      if (typeof input === "string") { text(input, path, 12000); return; }
      if (typeof input === "number") { if (!Number.isFinite(input)) add(path, "must be a finite number"); return; }
      if (typeof input !== "object") { add(path, "contains a value that is not supported by JSON"); return; }
      if (visited.has(input)) { add(path, "contains a circular reference"); return; }
      visited.add(input);
      if (Array.isArray(input) && input.length > 500) { add(path, "contains too many items"); return; }
      for (const key of Object.keys(input)) {
        if (["__proto__", "constructor", "prototype"].includes(key) || key.length > 100) { add(path, "contains a reserved or oversized object key"); continue; }
        if (nodes > 12000) break;
        inspect(input[key], `${path}.${key}`, depth + 1);
      }
    }
    inspect(value, "content", 0);
    if (value.schemaVersion !== 1) add("schemaVersion", "must be 1");
    if (!isRecord(value.profile)) add("profile", "must be an object");
    else {
      const profile = value.profile;
      for (const [key, max, required] of [["brand", 160, true], ["name", 160, true], ["role", 160, true]]) text(profile[key], `profile.${key}`, max, required);
      for (const [key, max] of [["summary", 4000], ["location", 200], ["email", 254], ["github", 12000], ["linkedinHandle", 200], ["disciplines", 4000], ["focus", 200], ["education", 200], ["availability", 4000]]) if (key in profile) text(profile[key], `profile.${key}`, max);
      if ("about" in profile) list(profile.about, "profile.about", 16).forEach((paragraph, index) => text(paragraph, `profile.about.${index}`, 4000));
      if (!draft && typeof profile.email === "string" && profile.email && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(profile.email)) add("profile.email", "must be a valid email address or be left empty");
      if (!draft && typeof profile.github === "string" && profile.github) {
        try { const url = new URL(profile.github); if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password) throw new Error(); }
        catch { add("profile.github", "must be a complete HTTPS GitHub URL without embedded credentials"); }
      }
    }
    const sectionIDs = new Set();
    if (Array.isArray(value.sections) && !value.sections.length) add("sections", "must keep at least one section");
    list(value.sections, "sections", 32).forEach((section, index) => {
      const path = `sections.${index}`;
      if (!isRecord(section)) { add(path, "must be an object"); return; }
      if (typeof section.id !== "string" || !ID_PATTERN.test(section.id)) add(`${path}.id`, "must be a lowercase slug starting with a letter");
      else if (sectionIDs.has(section.id)) add(`${path}.id`, "must be unique");
      else sectionIDs.add(section.id);
      text(section.title, `${path}.title`, 200, true);
      if (typeof section.visible !== "boolean") add(`${path}.visible`, "must be true or false");
      if ("description" in section) text(section.description, `${path}.description`, 4000);
      if ("eyebrow" in section) text(section.eyebrow, `${path}.eyebrow`, 200);
    });
    if (Array.isArray(value.sections)) {
      if (value.sections[0]?.id !== "home" || value.sections[0]?.visible !== true) add("sections", "must keep Home first and visible as the introduction");
      value.sections.slice(0, 32).forEach((section, index) => {
        if (!isRecord(section) || typeof section.id !== "string") return;
        const id = section.id;
        if (FIXED_DOM_IDS.has(id) || BUILT_IN_HEADINGS.has(id)) add(`sections.${index}.id`, "is reserved by the website");
        if ([...sectionIDs].some(other => other !== id && id === `${other}-title`)) add(`sections.${index}.id`, "collides with another section heading");
        if (!BUILT_IN_SECTIONS.includes(id) && FIXED_DOM_IDS.has(`${id}-title`)) add(`sections.${index}.id`, "would create a reserved website heading");
      });
    }
    const itemIDs = new Set();
    for (const collection of ["skills", "learning", "experience", "training"]) {
      list(value[collection], collection, collection === "skills" || collection === "learning" ? 120 : 40).forEach((item, index) => {
        const path = `${collection}.${index}`;
        if (!isRecord(item)) { add(path, "must be an object"); return; }
        if (typeof item.id !== "string" || !ID_PATTERN.test(item.id)) add(`${path}.id`, "must be a safe stable ID");
        else if (itemIDs.has(item.id)) add(`${path}.id`, "must be unique across content items");
        else itemIDs.add(item.id);
        text(item.title, `${path}.title`, 200, true);
        if (collection === "skills" || collection === "learning") {
          if (!sectionIDs.has(item.section)) add(`${path}.section`, "must refer to a section in this document");
        }
        if (collection === "skills") {
          text(item.description, `${path}.description`, 4000);
          if (!["defense", "offense", "research"].includes(item.category)) add(`${path}.category`, "must be defense, offense or research");
          list(item.tags, `${path}.tags`, 24).forEach((tag, tagIndex) => text(tag, `${path}.tags.${tagIndex}`, 100, true));
        } else if (collection === "learning") {
          if (item.status !== "studying") add(`${path}.status`, "must remain studying for a current-study topic");
        } else if (collection === "experience") {
          for (const [key, max] of [["period", 100], ["type", 120], ["description", 4000]]) text(item[key], `${path}.${key}`, max);
        } else {
          text(item.status, `${path}.status`, 80, true); text(item.source, `${path}.source`, 160);
          list(item.items, `${path}.items`, 120).forEach((entry, itemIndex) => text(entry, `${path}.items.${itemIndex}`, 500, true));
        }
      });
    }
    if ("labs" in value) {
      if (!isRecord(value.labs)) add("labs", "must be an object");
      else {
        text(value.labs.summary, "labs.summary", 4000);
        for (const key of ["tags", "platforms"]) list(value.labs[key], `labs.${key}`, 40).forEach((entry, index) => text(entry, `labs.${key}.${index}`, 160, true));
      }
    }
    if (!errors.length) {
      try {
        if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BYTES) add("content", "must be 248 KB or smaller before formatting");
        if (new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n").length > MAX_FILE_BYTES) add("content", "must be 250 KB or smaller when formatted for saving");
      }
      catch { add("content", "cannot be serialized as JSON"); }
    }
    return errors;
  }

  function report(errors, title = "Please check your draft", focus = false) {
    $("errorTitle").textContent = title;
    $("errorList").replaceChildren(...errors.map(error => {
      const item = document.createElement("li");
      item.textContent = typeof error === "string" ? error : `${error.path}: ${error.message}`;
      return item;
    }));
    $("editorError").hidden = !errors.length;
    if (focus && errors.length) $("editorError").focus();
  }
  function markInvalid(errors) {
    document.querySelectorAll("[data-profile],[data-field],[data-section-field]").forEach(field => field.removeAttribute("aria-invalid"));
    for (const error of errors) {
      const parts = error.path.split(".");
      if (parts[0] === "profile") document.querySelector(`[data-profile="${PROFILE_FIELDS.includes(parts[1]) ? parts[1] : ""}"]`)?.setAttribute("aria-invalid", "true");
      else if (["skills", "learning"].includes(parts[0]) && /^\d+$/.test(parts[1] || "")) {
        const item = state.document?.[parts[0]]?.[Number(parts[1])];
        const card = item && document.querySelector(`[data-collection="${parts[0]}"][data-item-id="${item.id}"]`);
        if (["title", "description", "tags", "category", "section"].includes(parts[2])) card?.querySelector(`[data-field="${parts[2]}"]`)?.setAttribute("aria-invalid", "true");
      }
    }
  }
  function status(message) { if ($("saveState")) $("saveState").textContent = message; }
  function savedTime() {
    if (!$("savedAt")) return;
    $("savedAt").textContent = state.savedAt ? `DEVICE COPY · ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(state.savedAt))}` : "";
  }
  function readCached() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); }
    catch { state.storageAvailable = false; return null; }
    if (!raw) return null;
    try {
      const cached = JSON.parse(raw);
      if (!isRecord(cached) || validateDocument(cached.document, { draft: true }).length || (cached.baseline && validateDocument(cached.baseline, { draft: true }).length)) throw new Error();
      return cached;
    } catch {
      state.storageBlocked = true;
      return null;
    }
  }
  function persist() {
    if (!state.document) return;
    if (validateDocument(state.document, { draft: true }).length) { status("Draft is in memory. Shorten or correct the marked fields before saving a device copy."); return; }
    state.savedAt = new Date().toISOString();
    if (!state.storageBlocked) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: state.savedAt, document: state.document, baseline: state.baseline, sha: state.revision }));
        state.storageAvailable = true;
      } catch { state.storageAvailable = false; }
    }
    savedTime();
    if (state.storageBlocked) status("Draft is in memory. Reset or import to replace an unreadable device copy.");
    else if (!state.storageAvailable) status("Draft is in memory. Browser storage is unavailable — export a copy.");
    else if (state.conflict) status("Device copy saved. Reconcile the newer online version before saving online.");
    else status(validateDocument(state.document).length ? "Device copy saved — complete the marked fields before publishing." : state.dirty ? "Device copy saved · Online changes not saved yet" : "Device copy saved · Up to date with loaded content");
  }
  let autosaveTimer;
  function changed() {
    state.dirty = !state.baseline || !same(state.document, state.baseline);
    status("Saving device copy…");
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => { markInvalid(validateDocument(state.document)); persist(); }, 350);
    renderPreview();
    updateButtons();
    subscribers.forEach(callback => { try { callback(clone(state.document)); } catch { /* A preview adapter cannot interrupt editing. */ } });
  }
  function sectionTitle(id) { return state.document?.sections.find(section => section.id === id)?.title || id; }
  function placementNote(item) {
    const section = state.document.sections.find(section => section.id === item.section);
    return `Placed in ${section?.title || item.section}${section?.visible === false ? " · This section is currently hidden" : ""}.`;
  }
  function populatePlacement(select, value) {
    select.replaceChildren(...state.document.sections.map(section => {
      const option = document.createElement("option"); option.value = section.id; option.textContent = section.title || section.id; return option;
    }));
    select.value = value;
  }
  function updatePlacementLabels() {
    document.querySelectorAll("[data-collection]").forEach(card => {
      const item = state.document[card.dataset.collection].find(entry => entry.id === card.dataset.itemId);
      if (!item) return;
      populatePlacement(card.querySelector('[data-field="section"]'), item.section);
      card.querySelector(".placement-note").textContent = placementNote(item);
    });
  }
  function renderPreview() {
    if (!state.document) return;
    const profile = state.document.profile;
    $("previewBrand").textContent = profile.brand || "Site name";
    $("previewName").textContent = profile.name || "Your name";
    $("previewRole").textContent = profile.role || "Your professional title";
    $("previewSummary").textContent = profile.summary || "Add an introduction when you are ready.";
    $("previewLocation").textContent = profile.location || "";
    $("previewFocus").textContent = profile.focus || "";
    $("previewStudy").replaceChildren(...state.document.learning.map(topic => {
      const tag = document.createElement("span"); tag.textContent = topic.title || "Untitled study topic"; return tag;
    }));
    $("previewStudyWrap").hidden = !state.document.learning.length;
    $("skillsCount").textContent = String(state.document.skills.length);
    $("learningCount").textContent = String(state.document.learning.length);
    $("sectionsCount").textContent = String(state.document.sections.length);
  }
  function renderProfile() {
    document.querySelectorAll("[data-profile]").forEach(field => {
      const value = state.document.profile[field.dataset.profile];
      field.value = field.dataset.profile === "about" ? (Array.isArray(value) ? value.join("\n\n") : "") : typeof value === "string" ? value : "";
    });
  }
  function renderCollection(collection) {
    const list = $(collection === "skills" ? "skillsList" : "learningList");
    const template = $(collection === "skills" ? "skillTemplate" : "learningTemplate");
    list.replaceChildren(...state.document[collection].map((item, index) => {
      const card = template.content.firstElementChild.cloneNode(true);
      card.dataset.collection = collection; card.dataset.itemId = item.id;
      card.querySelector(".item-number").textContent = `${String(index + 1).padStart(2, "0")} / ${collection === "skills" ? "CAPABILITY" : "CURRENT STUDY"}`;
      card.querySelector(".item-title").textContent = item.title || (collection === "skills" ? "Untitled skill" : "Untitled study topic");
      card.querySelector(".remove-item").setAttribute("aria-label", `Remove ${item.title || "untitled item"}`);
      card.querySelectorAll("[data-field]").forEach(field => {
        if (field.dataset.field === "section") populatePlacement(field, item.section);
        else field.value = field.dataset.field === "tags" ? item.tags.join(", ") : item[field.dataset.field];
      });
      card.querySelector(".placement-note").textContent = placementNote(item);
      return card;
    }));
    $(collection === "skills" ? "skillsEmpty" : "learningEmpty").hidden = state.document[collection].length !== 0;
  }
  function renderSections() {
    $("sectionsList").replaceChildren(...state.document.sections.map((section, index) => {
      const card = $("sectionTemplate").content.firstElementChild.cloneNode(true);
      card.dataset.sectionId = section.id; card.classList.toggle("is-hidden", !section.visible);
      card.querySelector(".item-number").textContent = `${String(index + 1).padStart(2, "0")} / ${section.id}`;
      card.querySelector(".section-name").textContent = section.title || "Untitled section";
      card.querySelector('[data-section-field="title"]').value = section.title;
      card.querySelector('[data-section-field="description"]').value = section.description || "";
      card.querySelector('[data-section-field="visible"]').checked = section.visible;
      card.querySelector('[data-section-field="visible"]').setAttribute("aria-label", `Show ${section.title || section.id}`);
      const pinned = section.id === "home";
      if (pinned) {
        card.querySelector(".section-controls").hidden = true;
        card.querySelector('[data-section-field="visible"]').disabled = true;
        card.querySelector("details").hidden = true;
        const note = document.createElement("p"); note.className = "placement-note";
        note.textContent = "The introduction stays first and visible. Edit your name and professional title in Profile.";
        card.append(note);
      }
      for (const direction of ["up", "down"]) {
        const button = card.querySelector(`[data-direction="${direction}"]`);
        button.disabled = pinned || (direction === "up" ? index <= 1 : index === state.document.sections.length - 1);
        button.setAttribute("aria-label", `Move ${section.title || section.id} ${direction}`);
      }
      return card;
    }));
  }
  function render() {
    renderProfile(); renderCollection("skills"); renderCollection("learning"); renderSections(); renderPreview();
    $("profileFields").disabled = false;
    document.querySelectorAll("[data-tab]").forEach(button => { button.disabled = false; });
    $("loadState").hidden = true;
    activateTab(state.selectedTab);
    updateButtons(); markInvalid(validateDocument(state.document));
  }
  function activateTab(tab, focus = false) {
    if (!["profile", "skills", "learning", "sections"].includes(tab) || !state.document) return;
    state.selectedTab = tab;
    document.querySelectorAll("[data-tab]").forEach(button => { const active = button.dataset.tab === tab; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
    document.querySelectorAll(".editor-panel").forEach(panel => { panel.hidden = panel.id !== `panel-${tab}`; });
    if (focus) document.querySelector(`#panel-${tab} h2`)?.focus();
  }
  function uniqueID(prefix) {
    const occupied = new Set([...(state.document?.sections || []), ...(state.document?.skills || []), ...(state.document?.learning || []), ...(state.document?.experience || []), ...(state.document?.training || [])].map(item => item.id));
    const sectionIDs = new Set((state.document?.sections || []).map(item => item.id));
    FIXED_DOM_IDS.forEach(id => occupied.add(id)); BUILT_IN_HEADINGS.forEach(id => occupied.add(id));
    sectionIDs.forEach(id => occupied.add(`${id}-title`));
    let base = prefix.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
    if (!/^[a-z]/.test(base)) base = "section-" + base;
    base = base.slice(0, 58);
    let id = base, suffix = 2;
    while (occupied.has(id) || sectionIDs.has(`${id}-title`) || FIXED_DOM_IDS.has(`${id}-title`)) id = `${base}-${suffix++}`;
    return id;
  }
  function addItem(collection) {
    if (!state.document) return;
    if (state.document[collection].length >= 120) { report(["A collection can contain up to 120 items."], "Collection limit reached", true); return; }
    const preferred = collection === "skills" ? "skills" : "learning";
    const section = state.document.sections.some(entry => entry.id === preferred) ? preferred : state.document.sections[0]?.id;
    if (!section) { activateTab("sections", true); report(["Add a section before placing a content item."], "A section is needed", true); return; }
    const item = collection === "skills" ? { id: uniqueID("skill"), title: "", description: "", tags: [], category: "defense", section } : { id: uniqueID("learning-topic"), title: "", status: "studying", section };
    state.document[collection].push(item); renderCollection(collection); changed();
    const card = document.querySelector(`[data-collection="${collection}"][data-item-id="${item.id}"]`);
    card.querySelector('[data-field="title"]').focus();
  }
  function removeItem(card) {
    const collection = card.dataset.collection;
    const index = state.document[collection].findIndex(item => item.id === card.dataset.itemId);
    if (index < 0) return;
    const [item] = state.document[collection].splice(index, 1);
    state.removed = { collection, index, item };
    $("undoMessage").textContent = `Removed ${item.title || "an untitled item"} from this draft.`;
    $("undoBar").hidden = false;
    renderCollection(collection); changed();
    $(collection === "skills" ? "addSkill" : "addLearning").focus();
  }
  function updateButtons() {
    if (!state.initialized) return;
    $("exportButton").disabled = !state.document;
    $("resetButton").disabled = !state.baseline || state.busy || state.conflict;
    $("resetCompact").disabled = !state.baseline || state.busy || state.conflict;
    const connection = state.connection.state;
    const connected = !!state.publisher && connection === "signedIn";
    $("publishButton").disabled = state.busy || (connected ? !state.document || !state.revision || !state.publisherReady || state.conflict : connection !== "signedOut");
    $("publishButton").textContent = state.busy ? "Saving online…" : connected ? (state.publisherReady ? "Save online" : "Load latest before saving") : connection === "signedOut" ? "Owner sign-in" : connection === "loading" ? "Checking connection…" : "Online setup required";
    $("logoutButton").hidden = connection !== "signedIn";
    $("logoutButton").disabled = state.busy;
    $("refreshConnection").disabled = state.busy;
    $("conflictPanel").hidden = !state.conflict;
    $("reloadOnlineButton").disabled = !state.publisher?.load || state.busy;
    $("exportButton").classList.toggle("button-primary", !connected);
    $("exportButton").classList.toggle("button-quiet", connected);
  }
  function setConnection(next) {
    if (!isRecord(next) || !["loading", "unconfigured", "signedOut", "signedIn", "error"].includes(next.state)) throw new TypeError("Invalid Studio connection state");
    state.connection = { ...state.connection, ...next };
    if (next.state !== "signedIn") { state.publisher = null; state.publisherReady = false; state.connection.userLabel = ""; state.connection.branch = ""; }
    if (!state.initialized) return;
    const connected = next.state === "signedIn";
    const title = { loading: "Connect your account.", unconfigured: "Online editing needs setup.", signedOut: "Your workspace. Your account.", signedIn: "Connected to your workspace.", error: "The online connection is unavailable." }[next.state];
    const message = { loading: "Checking the online editor connection. Local drafts remain on this device.", unconfigured: "The online publisher has not been configured yet. You can still prepare a local draft and export it.", signedOut: "Sign in with the owner's GitHub account to load the latest content and save online.", signedIn: "Your account can save changes to the configured content branch. Device backups remain available.", error: "Your draft is safe on this device. Reconnect to load and save online, or export a copy." }[next.state];
    $("connectionHeading").textContent = title;
    $("connectionMessage").textContent = typeof next.message === "string" ? next.message.slice(0, 1200) : message;
    $("connectionPanel").classList.toggle("is-connected", connected);
    $("loginButton").hidden = connected;
    $("loginButton").disabled = next.state !== "signedOut";
    const detail = [typeof state.connection.userLabel === "string" ? state.connection.userLabel.slice(0, 120) : "", typeof state.connection.branch === "string" && state.connection.branch ? `Branch: ${state.connection.branch.slice(0, 200)}` : ""].filter(Boolean).join(" · ");
    $("connectionMeta").textContent = detail; $("connectionMeta").hidden = !detail;
    $("storageTitle").textContent = connected ? "Connected + device backup" : "Local draft";
    $("storageDescription").textContent = connected ? "Save online when ready. A separate copy stays in this browser." : "Edits stay in this browser. The public site changes only after publishing.";
    $("publishInstructions").textContent = connected ? "Save online to the configured content branch, then review the resulting website update. Export content.json whenever you want a portable backup." : "Export content.json when your draft is ready. Upload it through your GitHub account and review the site update before publishing.";
    updateButtons();
  }
  function connectPublisher(adapter) {
    if (!isRecord(adapter) || typeof adapter.save !== "function" || (adapter.load !== undefined && typeof adapter.load !== "function")) throw new TypeError("A publisher needs a save function and an optional load function");
    state.publisher = adapter;
    state.publisherReady = !adapter.load && typeof adapter.revision === "string" && !!adapter.revision;
    if (typeof adapter.revision === "string") state.revision = adapter.revision;
    setConnection({ state: "signedIn", ...(typeof adapter.label === "string" ? { userLabel: adapter.label } : {}) });
    return () => { if (state.publisher === adapter) setConnection({ state: "signedOut" }); };
  }
  function adoptBaseline(payload, discardDraft = false) {
    if (!isRecord(payload) || validateDocument(payload.document).length) throw new Error("The content source returned an invalid document.");
    const incoming = clone(payload.document);
    const oldBase = state.baseline || state.cached?.baseline;
    const oldRevision = state.revision || state.cached?.sha;
    const current = state.document || state.cached?.document;
    const incomingRevision = typeof payload.sha === "string" ? payload.sha : null;
    const currentIsClean = !!current && !!oldBase && same(current, oldBase);
    const currentMatchesIncoming = !!current && same(current, incoming);
    const compatibleBase = (oldBase && same(oldBase, incoming)) || (oldRevision && incomingRevision && oldRevision === incomingRevision);
    if (discardDraft || !current || currentIsClean || currentMatchesIncoming) {
      state.baseline = incoming; state.document = clone(incoming);
      state.revision = incomingRevision || (compatibleBase && typeof oldRevision === "string" ? oldRevision : null);
      state.conflict = false;
    } else if (compatibleBase) {
      state.baseline = incoming; state.document = clone(current);
      state.revision = incomingRevision || (typeof oldRevision === "string" ? oldRevision : null);
      state.conflict = false;
    } else {
      state.document = clone(current); state.conflict = true;
      state.baseline = oldBase ? clone(oldBase) : null;
      state.revision = typeof oldRevision === "string" ? oldRevision : null;
      // Keep the revision on which the draft was based; never silently overwrite a newer one.
    }
    if (discardDraft) { state.storageBlocked = false; state.removed = null; $("undoBar").hidden = true; }
    state.cached = null; state.dirty = !same(state.document, incoming);
    if (payload.branch && state.connection.state === "signedIn") setConnection({ state: "signedIn", branch: payload.branch });
    report([]); render(); persist();
  }
  async function loadSource(loader, discardDraft = false) {
    const generation = ++state.loadGeneration;
    const draftAtStart = discardDraft && state.document ? clone(state.document) : null;
    if (!state.document) { $("loadState").hidden = false; $("loadTitle").textContent = "Opening your workspace"; $("loadMessage").textContent = "Reading the latest content."; $("retryButton").hidden = true; }
    try {
      const payload = await loader();
      if (generation !== state.loadGeneration) return;
      if (discardDraft && draftAtStart && state.document && !same(draftAtStart, state.document)) {
        state.conflict = true; persist(); updateButtons();
        report(["You edited this draft while the latest version was loading. Those edits were kept. Export the draft before loading the latest version again."], "New edits were preserved", true);
        return false;
      }
      adoptBaseline(payload, discardDraft);
      return true;
    } catch (error) {
      if (generation !== state.loadGeneration) return;
      if (state.document) report(["The latest content could not be loaded. Your current draft has been kept."], "Content connection unavailable");
      else {
        $("loadTitle").textContent = "Your content could not be loaded.";
        $("loadMessage").textContent = "Try again, or import content.json. When opening files directly, serve this folder over HTTP so the editor can read its content file.";
        $("retryButton").hidden = false;
      }
      if (error?.status === 401) setConnection({ state: "signedOut" });
      return false;
    }
  }
  async function loadStatic() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("./content.json", { cache: "no-cache", signal: controller.signal });
      if (!response.ok) throw new Error("Content file is unavailable");
      const text = await response.text();
      if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error("Content file is too large");
      return { document: JSON.parse(text), sha: null };
    } finally { clearTimeout(timeout); }
  }
  function loadOnline({ discardDraft = false } = {}) {
    if (!state.publisher?.load) return Promise.reject(new Error("No online content loader is connected."));
    const publisher = state.publisher;
    state.publisherReady = false; updateButtons();
    return loadSource(() => publisher.load(), discardDraft).then(loaded => {
      if (state.publisher === publisher) { state.publisherReady = !!loaded && !!state.revision && !state.conflict; updateButtons(); }
      return loaded;
    });
  }
  function exportDocument() {
    if (!state.document) return;
    const errors = validateDocument(state.document);
    if (errors.length) { markInvalid(errors); report(errors, "Complete these fields before export", true); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.document, null, 2) + "\n"], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "content.json"; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    status("Exported content.json · This does not publish the site");
  }
  async function saveOnline() {
    if (state.connection.state !== "signedIn" || !state.publisher) { if (state.connection.state === "signedOut") return login(); return; }
    if (!state.document || state.busy || state.conflict || !state.publisherReady) return;
    const errors = validateDocument(state.document);
    if (errors.length) { markInvalid(errors); report(errors, "Complete these fields before saving online", true); return; }
    clearTimeout(autosaveTimer); persist();
    const snapshot = clone(state.document), publisher = state.publisher;
    state.busy = true; updateButtons(); status("Saving your content online…"); report([]);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await publisher.save({ document: snapshot, sha: state.revision, signal: controller.signal });
      if (!isRecord(result) || typeof result.sha !== "string" || !result.sha) throw new Error("The publisher did not return a saved revision.");
      state.baseline = snapshot; state.revision = result.sha; state.conflict = false;
      state.dirty = !same(state.document, snapshot); persist();
      status(state.dirty ? "Saved online · Newer device edits still need saving" : "Saved online · Review the website update before publishing");
      if (typeof result.branch === "string") setConnection({ state: "signedIn", branch: result.branch });
    } catch (error) {
      if (error?.status === 409 || error?.code === "CONFLICT") {
        state.conflict = true; persist(); report(["The online document changed after this draft was loaded. Export this draft, load the latest version, and reconcile your changes."], "A newer revision needs review", true);
      } else if (error?.status === 401) {
        setConnection({ state: "signedOut" }); report(["Sign in again to save online. Your device draft has been kept."], "Your session ended", true);
      } else {
        if (!Number.isInteger(error?.status) || error.status >= 500) { state.conflict = true; persist(); }
        report(["The online save could not be confirmed. Your device draft has been kept. Export it and load the latest online version before trying again."], "Online save unavailable", true);
      }
    } finally { clearTimeout(timeout); state.busy = false; updateButtons(); }
  }
  function login() {
    if (state.connection.state !== "signedOut") return;
    if (typeof state.connection.onLogin === "function") state.connection.onLogin();
    else location.assign("/api/studio/login");
  }
  async function logout() {
    if (state.busy || typeof state.connection.onLogout !== "function") return;
    clearTimeout(autosaveTimer); persist();
    try { await state.connection.onLogout(); setConnection({ state: "signedOut" }); status("Signed out · Your device draft is still available"); }
    catch { report(["Sign-out could not be confirmed. Check the connection and try again."], "Connection unavailable", true); }
  }
  function requestReset(action) {
    state.resetAction = action;
    $("resetTitle").textContent = action === "online" ? "Load the latest online version?" : "Start from the loaded site data?";
    $("resetDialog").returnValue = ""; $("resetDialog").showModal();
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { report(["Choose a JSON file no larger than 250 KB."], "File is too large", true); return; }
    try {
      const imported = JSON.parse(await file.text());
      const errors = validateDocument(imported);
      if (errors.length) { report(errors, "This content file needs changes", true); return; }
      state.document = clone(imported); state.storageBlocked = false; state.removed = null; $("undoBar").hidden = true;
      report([]); render(); changed(); status("Imported into your device draft · Not saved online");
    } catch { report(["This file could not be read as JSON. Import the content.json file, not a JavaScript or HTML file."], "Import did not complete", true); }
  }
  function initialize() {
    state.initialized = true;
    state.cached = readCached();
    if (state.cached) { state.document = clone(state.cached.document); state.revision = typeof state.cached.sha === "string" ? state.cached.sha : null; state.savedAt = typeof state.cached.savedAt === "string" && Number.isFinite(Date.parse(state.cached.savedAt)) ? state.cached.savedAt : null; render(); savedTime(); status("Device draft restored · Checking loaded content"); }
    document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab, true)));
    $("profileForm").addEventListener("submit", event => event.preventDefault());
    $("profileForm").addEventListener("input", event => {
      const key = event.target.dataset.profile;
      if (!state.document || !PROFILE_FIELDS.includes(key)) return;
      state.document.profile[key] = key === "about" ? event.target.value.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean) : event.target.value;
      changed();
    });
    for (const collection of ["skills", "learning"]) {
      const list = $(collection === "skills" ? "skillsList" : "learningList");
      list.addEventListener("input", event => {
        const card = event.target.closest("[data-item-id]");
        const item = card && state.document[collection].find(entry => entry.id === card.dataset.itemId);
        const field = event.target.dataset.field;
        if (!item || !["title", "description", "tags", "category", "section"].includes(field)) return;
        if (field === "category" && !["defense", "offense", "research"].includes(event.target.value)) return;
        if (field === "section" && !state.document.sections.some(section => section.id === event.target.value)) return;
        item[field] = field === "tags" ? event.target.value.split(/[,\n]/).map(tag => tag.trim()).filter(Boolean) : event.target.value;
        card.querySelector(".item-title").textContent = item.title || "Untitled item";
        card.querySelector(".remove-item").setAttribute("aria-label", `Remove ${item.title || "untitled item"}`);
        card.querySelector(".placement-note").textContent = placementNote(item); changed();
      });
      list.addEventListener("click", event => { const button = event.target.closest(".remove-item"); if (button) removeItem(button.closest("[data-item-id]")); });
    }
    $("addSkill").addEventListener("click", () => addItem("skills")); $("addLearning").addEventListener("click", () => addItem("learning"));
    $("undoRemove").addEventListener("click", () => {
      if (!state.removed) return;
      const { collection, index, item } = state.removed;
      state.document[collection].splice(Math.min(index, state.document[collection].length), 0, item);
      state.removed = null; $("undoBar").hidden = true; renderCollection(collection); changed();
      activateTab(collection); document.querySelector(`[data-collection="${collection}"][data-item-id="${item.id}"] [data-field="title"]`)?.focus();
    });
    $("sectionsList").addEventListener("input", event => {
      const card = event.target.closest("[data-section-id]");
      const section = card && state.document.sections.find(entry => entry.id === card.dataset.sectionId);
      const field = event.target.dataset.sectionField;
      if (!section || section.id === "home" || !["title", "description", "visible"].includes(field)) return;
      section[field] = field === "visible" ? event.target.checked : event.target.value;
      card.classList.toggle("is-hidden", !section.visible); card.querySelector(".section-name").textContent = section.title || "Untitled section";
      card.querySelector('[data-section-field="visible"]').setAttribute("aria-label", `Show ${section.title || section.id}`);
      for (const direction of ["up", "down"]) card.querySelector(`[data-direction="${direction}"]`).setAttribute("aria-label", `Move ${section.title || section.id} ${direction}`);
      updatePlacementLabels(); changed();
    });
    $("sectionsList").addEventListener("click", event => {
      const button = event.target.closest("[data-direction]"); if (!button) return;
      const id = button.closest("[data-section-id]").dataset.sectionId;
      if (id === "home") return;
      const index = state.document.sections.findIndex(section => section.id === id);
      const next = index + (button.dataset.direction === "up" ? -1 : 1);
      if (index < 0 || next <= 0 || next >= state.document.sections.length) return;
      [state.document.sections[index], state.document.sections[next]] = [state.document.sections[next], state.document.sections[index]];
      renderSections(); updatePlacementLabels(); changed();
      const replacement = document.querySelector(`[data-section-id="${id}"] [data-direction="${button.dataset.direction}"]`);
      (replacement?.disabled ? document.querySelector(`[data-section-id="${id}"] [data-section-field="visible"]`) : replacement)?.focus();
    });
    $("addSection").addEventListener("click", () => { $("sectionForm").reset(); $("sectionDialog").showModal(); $("newSectionTitle").focus(); });
    $("cancelSection").addEventListener("click", () => $("sectionDialog").close());
    $("sectionForm").addEventListener("submit", event => {
      event.preventDefault();
      if (!$("sectionForm").reportValidity() || !state.document) return;
      if (state.document.sections.length >= 32) { $("sectionDialog").close(); report(["A document can contain up to 32 sections."], "Section limit reached", true); return; }
      const title = $("newSectionTitle").value.trim();
      if (!title) return;
      const section = { id: uniqueID(title), title, description: $("newSectionDescription").value, visible: true };
      state.document.sections.push(section); $("sectionDialog").close(); renderSections(); updatePlacementLabels(); changed();
      document.querySelector(`[data-section-id="${section.id}"] [data-section-field="visible"]`)?.focus();
    });
    $("importButton").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", event => { importFile(event.target.files?.[0]); event.target.value = ""; });
    $("exportButton").addEventListener("click", exportDocument); $("conflictExport").addEventListener("click", exportDocument);
    $("resetButton").addEventListener("click", () => requestReset("baseline"));
    $("resetCompact").addEventListener("click", () => requestReset("baseline"));
    $("reloadOnlineButton").addEventListener("click", () => requestReset("online"));
    $("resetDialog").addEventListener("close", () => {
      if ($("resetDialog").returnValue !== "reset") return;
      if (state.resetAction === "online") { loadOnline({ discardDraft: true }); return; }
      if (!state.baseline) return;
      state.document = clone(state.baseline); state.conflict = false; state.storageBlocked = false; state.removed = null; $("undoBar").hidden = true;
      report([]); render(); changed();
    });
    $("publishButton").addEventListener("click", () => state.connection.state === "signedOut" ? login() : saveOnline());
    $("loginButton").addEventListener("click", login); $("logoutButton").addEventListener("click", logout);
    $("refreshConnection").addEventListener("click", () => {
      if (typeof state.connection.onRefresh === "function") state.connection.onRefresh();
      else window.dispatchEvent(new Event("studio:session-request"));
    });
    $("retryButton").addEventListener("click", () => state.publisher?.load ? loadOnline() : loadSource(loadStatic));
    window.addEventListener("pagehide", () => { clearTimeout(autosaveTimer); persist(); });
    setConnection(state.connection);
    if (!state.publisher) loadSource(loadStatic);
    window.dispatchEvent(new Event("studio:ready"));
  }

  window.YousifStudio = Object.freeze({
    validateDocument,
    getDocument: () => state.document ? clone(state.document) : null,
    connectPublisher,
    setConnection,
    loadOnline,
    subscribe(callback) {
      if (typeof callback !== "function") throw new TypeError("A subscriber must be a function");
      subscribers.add(callback); if (state.document) callback(clone(state.document)); return () => subscribers.delete(callback);
    },
    getState: () => ({ ready: state.initialized, dirty: state.dirty, conflict: state.conflict, busy: state.busy, publisherReady: state.publisherReady, sha: state.revision, connection: state.connection.state })
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
