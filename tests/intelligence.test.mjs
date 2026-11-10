import assert from 'node:assert/strict';
import { FEEDS, categoryFor, cleanCountry, cleanText, dedupeArticles, fetchSource, gdeltUrl, globalReporting, headlineExcerpt, parseFeed, parseGdelt, parseKev, safeHttps } from '../lib/intelligence.mjs';

const checks = [];
const test = async (name, callback) => { await callback(); checks.push({ name, result: 'pass' }); };
const rssItem = (title, url, date = 'Tue, 10 Nov 2026 09:00:00 GMT') => `<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate></item>`;
const rss = (...items) => '<?xml version="1.0"?><rss><channel>' + items.join('') + '</channel></rss>';
const source = { name: 'Test Publisher' };

await test('RSS keeps only dated HTTPS items and decodes entity text', () => {
  const parsed = parseFeed(rss(rssItem('Security &amp; privacy', 'https://example.com/a?x=1&amp;y=2'), rssItem('Unsafe link', 'javascript:alert(1)'), rssItem('No date', 'https://example.com/b', 'invalid')), source);
  assert.equal(parsed.length, 1); assert.equal(parsed[0].title, 'Security & privacy'); assert.equal(parsed[0].url, 'https://example.com/a?x=1&y=2'); assert.equal(parsed[0].publishedAt, '2026-11-10T09:00:00.000Z');
});
await test('Atom selects the alternate link and published date', () => {
  const xml = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>AI security research</title><link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://example.com/article"/><published>2026-11-10T08:00:00Z</published></entry></feed>';
  const parsed = parseFeed(xml, source); assert.equal(parsed[0].url, 'https://example.com/article'); assert.equal(parsed[0].category, 'ai-security');
});
await test('Feed rejects DTD/entity documents and non-feed challenges', () => {
  assert.throws(() => parseFeed('<!DOCTYPE rss [<!ENTITY boom "boom">]><rss/>', source)); assert.throws(() => parseFeed('<html>Forbidden</html>', source));
});
await test('Public excerpts are at most twelve words and two items per publisher', () => {
  const title = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen';
  const parsed = parseFeed(rss(rssItem(title, 'https://example.com/one'), rssItem(title, 'https://example.com/two'), rssItem(title, 'https://example.com/three')), source);
  assert.equal(parsed.length, 2); assert.equal(parsed[0].title.split(/\s+/).length, 12); assert.ok(parsed[0].title.endsWith('…')); assert.equal(headlineExcerpt('Short title'), 'Short title');
});
await test('OpenAI source excludes unrelated product releases', () => {
  const parsed = parseFeed(rss(rssItem('Introducing a new model', 'https://example.com/model'), rssItem('Securing AI agents against prompt injection', 'https://example.com/security')), { name: 'OpenAI', securityOnly: true });
  assert.equal(parsed.length, 1); assert.equal(parsed[0].category, 'ai-security');
});
await test('Category inference uses only title terms', () => {
  assert.equal(categoryFor('A CVE-2026-12345 security patch'), 'vulnerabilities'); assert.equal(categoryFor('AI security research'), 'ai-security'); assert.equal(categoryFor('A phishing investigation'), 'security');
});
await test('HTTPS validation rejects credentials and active content schemes', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'http://example.com/', 'https://user:secret@example.com/', 'https://example.com:444/']) assert.equal(safeHttps(url), null);
  assert.equal(safeHttps('https://example.com/a#section'), 'https://example.com/a'); assert.equal(cleanText('<b>A</b> &quot;report&quot;'), 'A "report"');
});
await test('KEV is a bounded added-date advisory list without invented countries', () => {
  const value = { vulnerabilities: [1, 2, 3].map(number => ({ cveID: 'CVE-2026-1000' + number, dateAdded: '2026-11-0' + number, vulnerabilityName: 'Test vulnerability' })) };
  const rows = parseKev(value); assert.equal(rows.length, 2); assert.equal(rows[0].dateKind, 'added'); assert.equal(rows[0].category, 'vulnerabilities'); assert.deepEqual(rows[0].countries, []); assert.ok(rows[0].url.startsWith('https://nvd.nist.gov/vuln/detail/CVE-'));
});
await test('Country queries quote canonical names and reject query injection', () => {
  assert.equal(cleanCountry('  Côte d’Ivoire  '), "Côte d'Ivoire");
  for (const name of ['Iraq" OR domain:evil.com', 'https://example.com', '../Iraq', 'Iraq\nsourcecountry:china', '<Iraq>']) assert.throws(() => gdeltUrl(name));
  assert.ok(new URL(gdeltUrl('Iraq')).searchParams.get('query').startsWith('"Iraq" ('));
});
await test('GDELT dates remain indexed dates and country matches remain query matches', () => {
  const rows = parseGdelt({ articles: [{ title: 'Country security report', url: 'https://example.com/report', domain: 'example.com', seendate: '20261110T082500Z' }] }, 'Iraq');
  assert.equal(rows[0].publishedAt, '2026-11-10T08:25:00.000Z'); assert.equal(rows[0].dateKind, 'indexed'); assert.equal(rows[0].countryMatch, 'news-query'); assert.deepEqual(rows[0].countries, ['Iraq']);
});
await test('Duplicates and excessive same-publisher items are removed', () => {
  const base = { title: 'A', publisher: 'Source', publishedAt: '2026-11-10T08:00:00Z' };
  assert.equal(dedupeArticles([{ ...base, url: 'https://example.com/1' }, { ...base, url: 'https://example.com/1' }, { ...base, url: 'https://example.com/2' }, { ...base, url: 'https://example.com/3' }]).length, 2);
});
await test('No arbitrary upstream URL can be fetched', async () => {
  let calls = 0; await assert.rejects(fetchSource('https://evil.example/feed', { fetchImpl: async () => { calls++; return new Response(''); } })); assert.equal(calls, 0);
});
await test('Source redirects cannot escape the fixed host allowlist', async () => {
  let calls = 0; await assert.rejects(fetchSource(FEEDS[0].url, { fetchImpl: async () => { calls++; return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }); } })); assert.equal(calls, 1);
});
await test('Upstream reads are bounded even when content-length is absent', async () => {
  await assert.rejects(fetchSource(FEEDS[0].url, { limit: 10, fetchImpl: async () => new Response('x'.repeat(20)) }));
});
await test('Timeout aborts a hanging upstream fetch', async () => {
  await assert.rejects(fetchSource(FEEDS[0].url, { timeout: 20, fetchImpl: async (_url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })) }));
});
await test('Partial source failure is represented without fabricated fallback articles', async () => {
  const result = await globalReporting(async url => { if (url !== FEEDS[0].url) throw new Error('Unavailable test fixture'); return rss(rssItem('Security reporting test', 'https://example.com/verified-fixture')); });
  assert.equal(result.status, 'partial'); assert.equal(result.articles.length, 1); assert.equal(result.sources.filter(item => item.status === 'unavailable').length, 4); assert.deepEqual(result.advisories, []);
});
await test('Total source failure returns an empty unavailable response', async () => {
  const result = await globalReporting(async () => { throw new Error('Unavailable test fixture'); });
  assert.equal(result.status, 'unavailable'); assert.deepEqual(result.articles, []); assert.deepEqual(result.advisories, []);
});

const originalFetch = globalThis.fetch;
const { default: handler } = await import('../api/intelligence.js');
const invoke = async (url, method = 'GET') => {
  const response = { statusCode: 0, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(value) { this.body = value ? JSON.parse(value) : null; } };
  await handler({ method, url }, response); return response;
};
try {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ articles: [{ title: 'Country security test', url: 'https://example.com/current-report', domain: 'example.com', seendate: '20261110T082500Z' }] }), { headers: { 'Content-Type': 'application/json' } }); };
  await test('Handler rejects unsupported methods and arbitrary proxy parameters', async () => {
    assert.equal((await invoke('/api/intelligence', 'POST')).statusCode, 405); assert.equal((await invoke('/api/intelligence?url=https://example.com')).statusCode, 400); assert.equal(calls, 0);
  });
  await test('Handler accepts only names in the supplied country map', async () => {
    assert.equal((await invoke('/api/intelligence?country=Imaginary%20Country')).statusCode, 400); assert.equal(calls, 0);
  });
  await test('Valid country requests are cached with the original source-check date', async () => {
    const first = await invoke('/api/intelligence?country=Iraq');
    const second = await invoke('/api/intelligence?country=iraq');
    assert.equal(first.statusCode, 200); assert.equal(first.body.status, 'fresh'); assert.equal(first.body.country, 'Iraq'); assert.equal(second.body.cached, true); assert.equal(second.body.generatedAt, first.body.generatedAt); assert.equal(calls, 1); assert.match(first.headers['Cache-Control'], /s-maxage=600/);
  });
  globalThis.fetch = async () => { throw new Error('Unavailable test fixture'); };
  await test('Country outage never substitutes global articles', async () => {
    const result = await invoke('/api/intelligence?country=France'); assert.equal(result.statusCode, 200); assert.equal(result.body.status, 'unavailable'); assert.deepEqual(result.body.articles, []); assert.deepEqual(result.body.advisories, []);
  });
} finally { globalThis.fetch = originalFetch; }

console.log(JSON.stringify({ passed: checks.length, failed: 0, checks }, null, 2));
