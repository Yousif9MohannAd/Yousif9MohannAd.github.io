import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import '../renderer.js';
import { validateDocument as validateServer } from '../lib/studio.mjs';

const renderer = globalThis.YousifContent;
const source = JSON.parse(readFileSync(new URL('../content.json', import.meta.url), 'utf8'));
const studioSource = readFileSync(new URL('../studio.js', import.meta.url), 'utf8');
const browser = { window: {}, document: { readyState: 'loading', addEventListener() {} }, URL, TextEncoder, setTimeout, clearTimeout, console };
runInNewContext(studioSource, browser, { filename: 'studio.js' });
const validateEditor = browser.window.YousifStudio.validateDocument;
const clone = value => structuredClone(value);
const clean = html => String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const ids = html => [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const sectionIDs = html => [...html.matchAll(/<section\b[^>]*\sid="([^"]+)"/g)].map(match => match[1]);
const validateBoth = data => {
  assert.doesNotThrow(() => validateServer(data));
  const errors = validateEditor(data);
  assert.equal(errors.length, 0, JSON.stringify(errors));
};
const assertAnchors = html => {
  const existing = new Set(ids(html));
  const missing = [...html.matchAll(/\shref="#([^"]+)"/g)].map(match => match[1]).filter(id => !existing.has(id));
  assert.deepEqual(missing, [], 'Internal navigation links must target rendered content');
};

test('default page has unique IDs, valid anchor targets and honest SEO identity', () => {
  const html = renderer.page(source);
  assert.equal(new Set(ids(html)).size, ids(html).length);
  assertAnchors(html);
  const meta = renderer.metadata(source);
  assert.equal(meta.title, `${source.profile.brand} — ${source.profile.name} | ${source.profile.role}`);
  assert.ok(meta.description.includes(source.profile.brand));
  assert.equal(meta.structured['@graph'].find(item => item['@type'] === 'Person').jobTitle, source.profile.role);
  assert.equal(meta.structured['@graph'].find(item => item['@type'] === 'WebSite').name, source.profile.brand);
  assert.ok(meta.canonical.startsWith('https://'));
  const embedded = html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embedded), source);
});

test('HTML, attributes and embedded JSON escape owner-authored text safely', () => {
  const update = clone(source);
  const value = '</script><script>alert("x")</script><img src=x onerror=alert(1)>';
  update.profile.name = value;
  update.profile.brand = 'Brand" autofocus onfocus="alert(1)';
  update.skills[0].title = value;
  update.skills[0].tags[0] = '<svg onload=alert(1)>';
  update.sections[1].description = value;
  validateServer(update);
  const html = renderer.page(update);
  assert.equal(html.includes('<script>alert("x")</script>'), false);
  assert.equal(html.includes('<img src=x onerror='), false);
  assert.equal(html.includes('<svg onload='), false);
  assert.ok(html.includes('&lt;script&gt;'));
  const embedded = html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(embedded).profile.name, value);
});

test('renderer accepts the same 120-item collection bound as Studio and server', () => {
  const update = clone(source);
  update.skills = Array.from({ length: 120 }, (_, index) => ({ ...clone(source.skills[0]), id: `capability-${index}`, title: `Capability ${index}` }));
  validateBoth(update);
  assert.doesNotThrow(() => renderer.page(update));
  assert.equal((renderer.main(update).match(/data-kind="skill"/g) || []).length, 120);
});

test('renderer accepts 32-section capacity and preserves the configured non-Home order', () => {
  const update = clone(source);
  while (update.sections.length < 32) update.sections.push({ id: `custom-${update.sections.length}`, title: 'Custom section', visible: true });
  const [home, ...sections] = update.sections;
  update.sections = [home, ...sections.reverse()];
  validateBoth(update);
  assert.doesNotThrow(() => renderer.page(update));
  assert.deepEqual(sectionIDs(renderer.main(update)), update.sections.filter(section => section.visible).map(section => section.id));
});

test('every permitted placement renders all skill and learning records, including Home', () => {
  const destinations = [...source.sections.map(section => section.id), 'future-lab'];
  for (const destination of destinations) {
    const update = clone(source);
    update.sections.push({ id: 'future-lab', title: 'Future lab', visible: true });
    update.skills.forEach(item => { item.section = destination; });
    update.learning.forEach(item => { item.section = destination; });
    validateBoth(update);
    const html = renderer.main(update);
    for (const item of update.skills) assert.ok(html.includes(`data-item-id="${item.id}"`), `Missing skill ${item.id} when placed in ${destination}`);
    for (const item of update.learning) assert.ok(html.includes(`data-study-id="${item.id}"`), `Missing topic ${item.id} when placed in ${destination}`);
  }
});

test('learning placed in Capabilities retains an inline 3D preview host', () => {
  const update = clone(source);
  update.learning[0].section = 'skills';
  validateBoth(update);
  const html = renderer.main(update);
  const section = html.match(/<section\b[^>]*\sid="skills"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.ok(section.includes('class="learning-explorer"'));
  assert.ok(section.includes('class="learning-preview-stage"'));
});

test('optional About, lab and GitHub data can be absent without breaking a valid save', () => {
  for (const field of ['about', 'github', 'labs']) {
    const update = clone(source);
    if (field === 'labs') delete update.labs;
    else delete update.profile[field];
    validateBoth(update);
    assert.doesNotThrow(() => renderer.page(update), `Missing optional ${field} must render safely`);
  }
});

test('hiding optional sections cannot leave the hero action links pointing at missing IDs', () => {
  for (const hidden of [['skills'], ['about'], ['skills', 'about']]) {
    const update = clone(source);
    update.sections.forEach(section => { if (hidden.includes(section.id)) section.visible = false; });
    validateBoth(update);
    const html = renderer.page(update);
    hidden.forEach(id => assert.equal(sectionIDs(html).includes(id), false));
    assertAnchors(html);
  }
});

test('backend and editor reject Home and reserved-ID configurations that would break the page', () => {
  const invalid = [];
  const homeHidden = clone(source); homeHidden.sections[0].visible = false; invalid.push(homeHidden);
  const reordered = clone(source); [reordered.sections[0], reordered.sections[1]] = [reordered.sections[1], reordered.sections[0]]; invalid.push(reordered);
  for (const id of ['main', 'year', 'site-data', 'site-schema', 'observatory', 'observatory-title', 'observatory-map-note', 'about-title']) {
    const update = clone(source); update.sections.push({ id, title: 'Custom section', visible: true }); invalid.push(update);
  }
  const headings = clone(source); headings.sections.push({ id: 'future-lab', title: 'Future lab', visible: true }, { id: 'future-lab-title', title: 'Another section', visible: true }); invalid.push(headings);
  for (const update of invalid) {
    assert.throws(() => validateServer(update));
    assert.ok(validateEditor(update).length > 0);
  }
});
