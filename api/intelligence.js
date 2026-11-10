import { readFile } from 'node:fs/promises';
import { cleanCountry, fetchSource, gdeltUrl, globalReporting, parseGdelt } from '../lib/intelligence.mjs';

const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();
const pending = new Map();
let countryIndex;

async function resolveCountry(input) {
  const value = cleanCountry(input);
  if (!value) return null;
  // Fixed file path. Country names from this map are the only accepted query terms.
  if (!countryIndex) countryIndex = readFile(new URL('../data/world-map.json', import.meta.url), 'utf8').then(text => {
    const value = JSON.parse(text);
    if (!Array.isArray(value.countries)) throw new Error('Country index unavailable');
    return new Map(value.countries.map(country => [cleanCountry(country.name).toLocaleLowerCase('en'), cleanCountry(country.name)]));
  }).catch(error => { countryIndex = null; throw error; });
  const names = await countryIndex;
  const canonical = names.get(value.toLocaleLowerCase('en'));
  if (!canonical) throw new TypeError('Choose a country from the map');
  return canonical;
}

async function countryReporting(country) {
  const generatedAt = new Date().toISOString();
  const source = { name: 'GDELT news index', url: 'https://www.gdeltproject.org/', updatedAt: null, status: 'unavailable' };
  try {
    const articles = parseGdelt(JSON.parse(await fetchSource(gdeltUrl(country))), country);
    source.status = 'ok';
    source.updatedAt = articles[0]?.publishedAt || null;
    return { status: articles.length ? 'fresh' : 'empty', generatedAt, fetchedAt: generatedAt, country, coverage: 'Country news coverage', sources: [source], articles, advisories: [] };
  } catch {
    return { status: 'unavailable', generatedAt, fetchedAt: generatedAt, country, coverage: 'Country news coverage', sources: [source], articles: [], advisories: [], message: 'Country reporting is temporarily unavailable.' };
  }
}

async function getReporting(country) {
  const key = country || '__global__';
  const stored = cache.get(key);
  if (stored && stored.expires > Date.now()) return { ...stored.payload, cached: true };
  if (pending.has(key)) return pending.get(key);
  const request = (country ? countryReporting(country) : globalReporting()).then(payload => {
    const ttl = payload.status === 'unavailable' ? 60_000 : CACHE_TTL;
    cache.delete(key);
    cache.set(key, { payload, expires: Date.now() + ttl });
    while (cache.size > 24) cache.delete(cache.keys().next().value);
    return { ...payload, cached: false };
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    res.end(JSON.stringify({ status: 'unavailable', message: 'Method not allowed.' }));
    return;
  }
  try {
    const url = new URL(req.url, 'https://observatory.local');
    if ([...url.searchParams.keys()].some(key => key !== 'country')) {
      res.statusCode = 400;
      res.end(JSON.stringify({ status: 'unavailable', message: 'Unsupported request parameter.' }));
      return;
    }
    let country;
    try { country = await resolveCountry(url.searchParams.get('country')); }
    catch (error) {
      res.statusCode = error instanceof TypeError || error.message === 'Invalid country' ? 400 : 503;
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ status: 'unavailable', country: null, message: res.statusCode === 400 ? 'Choose a country from the country selector.' : 'Country lookup is temporarily unavailable.', sources: [], articles: [], advisories: [] }));
      return;
    }
    const payload = await getReporting(country);
    res.statusCode = 200;
    res.setHeader('Cache-Control', payload.status === 'unavailable' ? 'public, max-age=0, s-maxage=60' : 'public, max-age=0, s-maxage=600, stale-while-revalidate=1800');
    res.end(req.method === 'HEAD' ? '' : JSON.stringify(payload));
  } catch {
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ status: 'unavailable', message: 'Reporting is temporarily unavailable.', sources: [], articles: [], advisories: [] }));
  }
}
