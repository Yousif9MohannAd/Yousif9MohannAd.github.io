import { createHash } from 'node:crypto';

export const FEEDS = Object.freeze([
  { name: 'Google Security', url: 'https://security.googleblog.com/feeds/posts/default?alt=rss', type: 'rss' },
  { name: 'Microsoft Security', url: 'https://www.microsoft.com/en-us/security/blog/feed/', type: 'rss' },
  { name: 'Cloudflare Security', url: 'https://blog.cloudflare.com/tag/security/rss/', type: 'rss' },
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', type: 'rss', securityOnly: true },
  { name: 'CISA KEV', url: 'https://raw.githubusercontent.com/cisagov/kev-data/main/known_exploited_vulnerabilities.json', type: 'kev' }
]);
const ALLOWED_HOSTS = new Set(FEEDS.map(feed => new URL(feed.url).hostname).concat('api.gdeltproject.org'));
const AI_TERMS = /\bAI\b|artificial intelligence|\bLLMs?\b|prompt injection|machine learning|agentic|model (?:security|safety)|generative/i;
const SECURITY_TERMS = /secur|safety|cyber|prompt injection|malware|vulnerab|phishing|threat|abuse|attack|fraud|red.team|model (?:risk|safety)|alignment|jailbreak/i;
const VULNERABILITY_TERMS = /vulnerab|\bCVE-\d{4}-\d+\b|zero.day|0.day|security (?:fix|patch)|remote code execution|exploit/i;

export function cleanText(value, limit = 280) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity) => {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      const key = entity.toLowerCase();
      if (named[key]) return named[key];
      const code = key.startsWith('#x') ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    }).replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function safeHttps(value) {
  try {
    const url = new URL(cleanText(value, 2500));
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function categoryFor(title) {
  return AI_TERMS.test(title) ? 'ai-security' : VULNERABILITY_TERMS.test(title) ? 'vulnerabilities' : 'security';
}

export function headlineExcerpt(title) {
  const words = cleanText(title).split(/\s+/);
  return words.slice(0, 12).join(' ') + (words.length > 12 ? '…' : '');
}

export function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function firstTag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)<\\/' + name + '\\s*>', 'i'));
    if (match) return match[1];
  }
  return '';
}

function entryLink(block) {
  const rss = safeHttps(firstTag(block, ['link']));
  if (rss) return rss;
  const links = [...block.matchAll(/<link\b([^>]+)>/gi)];
  for (const [, attributes] of links) {
    const rel = attributes.match(/\brel\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (rel && rel !== 'alternate') continue;
    const href = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    const url = safeHttps(href);
    if (url) return url;
  }
  return null;
}

function idFor(publisher, url) {
  return createHash('sha256').update(publisher + '\n' + url).digest('hex').slice(0, 20);
}

export function parseFeed(xml, source) {
  if (typeof xml !== 'string' || xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<(?:rss|feed)\b/i.test(xml)) throw new Error('Invalid feed document');
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)];
  if (!blocks.length) blocks.push(...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi));
  const articles = [];
  for (const match of blocks.slice(0, 70)) {
    const block = match[1];
    const title = cleanText(firstTag(block, ['title']));
    const url = entryLink(block);
    const publishedAt = isoDate(cleanText(firstTag(block, ['pubDate', 'published', 'updated', 'dc:date'])));
    if (!title || !url || !publishedAt || (source.securityOnly && !SECURITY_TERMS.test(title))) continue;
    articles.push({ id: idFor(source.name, url), title: headlineExcerpt(title), url, publisher: source.name, publishedAt, dateKind: 'published', category: categoryFor(title), countries: [] });
  }
  return dedupeArticles(articles);
}

export function parseKev(value) {
  if (!value || !Array.isArray(value.vulnerabilities)) throw new Error('Invalid KEV document');
  return value.vulnerabilities.filter(row => /^CVE-\d{4}-\d{4,}$/i.test(row.cveID || '') && isoDate(row.dateAdded))
    .sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded))).slice(0, 2).map(row => {
      const url = 'https://nvd.nist.gov/vuln/detail/' + row.cveID;
      return { id: idFor('CISA KEV', url), title: headlineExcerpt(row.cveID + ' · ' + row.vulnerabilityName), url, publisher: 'CISA KEV', publishedAt: isoDate(row.dateAdded), dateKind: 'added', category: 'vulnerabilities', countries: [], kind: 'advisory' };
    });
}

export function cleanCountry(value) {
  const country = String(value || '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  if (!country) return '';
  if (country.length > 70 || !/^[\p{L}][\p{L}\p{M}\s.'()-]*$/u.test(country)) throw new Error('Invalid country');
  return country;
}

export function gdeltUrl(country) {
  const name = cleanCountry(country);
  if (!name) throw new Error('Country required');
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', '"' + name + '" (cyberattack OR ransomware OR cybersecurity OR "AI security") sourcelang:english');
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sort', 'datedesc');
  url.searchParams.set('maxrecords', '24');
  url.searchParams.set('timespan', '1week');
  return url.href;
}

function gdeltDate(value) {
  const compact = String(value || '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return compact ? isoDate(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`) : isoDate(value);
}

export function parseGdelt(value, country) {
  if (!value || !Array.isArray(value.articles)) throw new Error('Invalid news index response');
  return dedupeArticles(value.articles.slice(0, 40).flatMap(row => {
    const title = cleanText(row.title);
    const url = safeHttps(row.url);
    const publishedAt = gdeltDate(row.seendate);
    if (!title || !url || !publishedAt) return [];
    const publisher = cleanText(row.domain || new URL(url).hostname, 100);
    return [{ id: idFor(publisher, url), title: headlineExcerpt(title), url, publisher, publishedAt, dateKind: 'indexed', category: categoryFor(title), countries: [country], countryMatch: 'news-query' }];
  }));
}

export function dedupeArticles(articles) {
  const items = new Map();
  for (const article of articles) if (article?.url && !items.has(article.url)) items.set(article.url, article);
  const counts = new Map();
  return [...items.values()].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).filter(article => {
    const publisher = String(article.publisher).toLocaleLowerCase('en');
    const count = counts.get(publisher) || 0;
    if (count >= 2) return false;
    counts.set(publisher, count + 1);
    return true;
  });
}

export async function fetchSource(url, { timeout = 6500, limit = 2_500_000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    let current = url;
    for (let count = 0; count < 3; count++) {
      const parsed = new URL(current);
      if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) throw new Error('Source not allowed');
      const response = await fetchImpl(current, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml;q=0.9', 'User-Agent': 'YousifJ0-SecurityObservatory/1.0' } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Invalid source redirect');
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) throw new Error('Source unavailable');
      if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('Source too large');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Source body unavailable');
      const chunks = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error('Source too large'); }
        chunks.push(Buffer.from(chunk.value));
      }
      return Buffer.concat(chunks).toString('utf8');
    }
    throw new Error('Too many source redirects');
  } finally { clearTimeout(timer); }
}

export async function globalReporting(fetcher = fetchSource) {
  const generatedAt = new Date().toISOString();
  const settled = await Promise.allSettled(FEEDS.map(async source => {
    const text = await fetcher(source.url);
    const articles = source.type === 'kev' ? parseKev(JSON.parse(text)) : parseFeed(text, source);
    return { source: { name: source.name, url: source.url, status: 'ok', updatedAt: articles[0]?.publishedAt || null }, articles, type: source.type };
  }));
  const sources = [], articles = [], advisories = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sources.push(result.value.source);
      (result.value.type === 'kev' ? advisories : articles).push(...result.value.articles);
    } else sources.push({ name: FEEDS[index].name, url: FEEDS[index].url, status: 'unavailable', updatedAt: null });
  });
  const successful = sources.filter(source => source.status === 'ok').length;
  const unique = dedupeArticles(articles).slice(0, 36);
  return { status: !successful ? 'unavailable' : successful < sources.length ? 'partial' : unique.length || advisories.length ? 'fresh' : 'empty', generatedAt, fetchedAt: generatedAt, country: null, coverage: 'Global public reporting', sources, articles: unique, advisories };
}
