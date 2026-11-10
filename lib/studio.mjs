import { createHash, createHmac, createPrivateKey, randomBytes, sign, timingSafeEqual } from 'node:crypto';

export const OWNER_ID = 185284854;
export const OWNER_LOGIN = 'Yousif9MohannAd';
export const REPO_NAME = 'Yousif9MohannAd.github.io';
export const REPOSITORY = `${OWNER_LOGIN}/${REPO_NAME}`;
export const REPOSITORY_ID = 1354383590;
export const CONTENT_PATH = 'content.json';
export const BODY_LIMIT = 250 * 1024;
export const SESSION_TTL = 30 * 60;
export const OAUTH_TTL = 10 * 60;
export const SESSION_COOKIE = '__Host-yousif_studio';
export const OAUTH_COOKIE = '__Host-yousif_studio_oauth';
const API_VERSION = '2026-03-10';
const REQUIRED = ['GITHUB_APP_ID', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_PRIVATE_KEY', 'STUDIO_SESSION_SECRET', 'STUDIO_ORIGIN'];
const encoder = value => Buffer.from(value).toString('base64url');
const seconds = () => Math.floor(Date.now() / 1000);
const slug = /^[a-z][a-z0-9-]{0,63}$/;
const shaPattern = /^[a-f0-9]{40}$/;
const builtInSections = new Set(['home', 'about', 'skills', 'learning', 'labs', 'experience', 'certificates', 'intelligence', 'contact']);
const reservedSectionIds = new Set(['main', 'year', 'site-data', 'site-schema', 'observatory-title', 'observatory-map-note', ...[...builtInSections].map(id => `${id}-title`)]);

export class StudioError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function configuration(env = process.env) {
  const missing = REQUIRED.filter(name => typeof env[name] !== 'string' || !env[name].trim());
  const invalid = [];
  if (missing.length) return { configured: false, missing, invalid };
  let origin;
  try {
    const parsed = new URL(env.STUDIO_ORIGIN);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error();
    origin = parsed.origin;
  } catch { invalid.push('STUDIO_ORIGIN'); }
  if (!/^\d{1,20}$/.test(env.GITHUB_APP_ID.trim())) invalid.push('GITHUB_APP_ID');
  if (!/^[A-Za-z0-9_.-]{3,128}$/.test(env.GITHUB_CLIENT_ID.trim())) invalid.push('GITHUB_CLIENT_ID');
  if (Buffer.byteLength(env.GITHUB_CLIENT_SECRET) > 4096 || /[\r\n\0]/.test(env.GITHUB_CLIENT_SECRET)) invalid.push('GITHUB_CLIENT_SECRET');
  if (Buffer.byteLength(env.STUDIO_SESSION_SECRET) < 32 || Buffer.byteLength(env.STUDIO_SESSION_SECRET) > 256 || /[\r\n\0]/.test(env.STUDIO_SESSION_SECRET)) invalid.push('STUDIO_SESSION_SECRET');
  let privateKey;
  try {
    privateKey = createPrivateKey(env.GITHUB_PRIVATE_KEY.replaceAll('\\n', '\n'));
    if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails?.modulusLength < 2048) throw new Error();
  } catch { invalid.push('GITHUB_PRIVATE_KEY'); }
  const branch = (env.CONTENT_BRANCH || env.VERCEL_GIT_COMMIT_REF || 'codex/portfolio-redesign-20261109').trim();
  if (!validBranch(branch)) invalid.push('CONTENT_BRANCH');
  if (invalid.length) return { configured: false, missing, invalid };
  return {
    configured: true, missing, invalid,
    config: { origin, branch, appId: env.GITHUB_APP_ID.trim(), clientId: env.GITHUB_CLIENT_ID.trim(), clientSecret: env.GITHUB_CLIENT_SECRET, privateKey, sessionSecret: env.STUDIO_SESSION_SECRET }
  };
}

export function requireConfiguration() {
  const result = configuration();
  if (!result.configured) throw new StudioError(503, 'studio_not_configured', 'Private Studio is not configured yet.', { configured: false, missing: result.missing, invalid: result.invalid });
  return result.config;
}

export function validBranch(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 180 &&
    !/[\s\x00-\x1f\x7f~^:?*\[\\]/.test(value) && !value.includes('..') && !value.includes('@{') &&
    value !== '@' && !value.startsWith('/') && !value.endsWith('/') && !value.endsWith('.') &&
    value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'));
}

export function header(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : '';
}

export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length > 8192 || right.length > 8192) return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function seal(payload, purpose, secret) {
  const data = encoder(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`studio:${purpose}:v1.${data}`).digest('base64url');
  return `${data}.${signature}`;
}

export function unseal(value, purpose, secret, now = seconds()) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const signature = createHmac('sha256', secret).update(`studio:${purpose}:v1.${parts[0]}`).digest('base64url');
  if (!safeEqual(parts[1], signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const ttl = purpose === 'session' ? SESSION_TTL : OAUTH_TTL;
    if (payload.v !== 1 || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.iat > now + 30 || payload.exp <= now || payload.exp <= payload.iat || payload.exp - payload.iat > ttl) return null;
    return payload;
  } catch { return null; }
}

export function cookieValue(req, name) {
  const cookies = header(req, 'cookie').split(';').map(part => part.trim()).filter(Boolean);
  const matches = cookies.filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) return '';
  return matches[0].slice(name.length + 1);
}

export function setCookie(res, name, value, ttl, sameSite = 'Strict') {
  const cookie = `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${ttl}; Expires=${new Date(Date.now() + ttl * 1000).toUTCString()}`;
  const previous = res.getHeader?.('Set-Cookie');
  const list = !previous ? [] : Array.isArray(previous) ? previous : [previous];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

export function clearCookie(res, name, sameSite = 'Strict') {
  setCookie(res, name, '', 0, sameSite);
}

export function createSession(user, config, now = seconds()) {
  if (user?.id !== OWNER_ID || !/^[A-Za-z0-9-]{1,39}$/.test(user.login || '')) throw new StudioError(403, 'owner_only', 'This Studio is available only to its owner.');
  return { v: 1, uid: OWNER_ID, login: user.login, csrf: randomBytes(32).toString('base64url'), iat: now, exp: now + SESSION_TTL };
}

export function readSession(req, config, now = seconds()) {
  const session = unseal(cookieValue(req, SESSION_COOKIE), 'session', config.sessionSecret, now);
  if (session?.uid !== OWNER_ID || !/^[A-Za-z0-9-]{1,39}$/.test(session.login || '') || !/^[A-Za-z0-9_-]{43}$/.test(session.csrf || '')) return null;
  return session;
}

export function requireSession(req, config) {
  const session = readSession(req, config);
  if (!session) throw new StudioError(401, 'sign_in_required', 'Sign in to the owner account before opening Studio content.');
  return session;
}

export function assertSameOrigin(req, config, required = false) {
  const origin = header(req, 'origin');
  if ((required && !origin) || (origin && origin !== config.origin) || header(req, 'sec-fetch-site') === 'cross-site') {
    throw new StudioError(403, 'origin_rejected', 'Open Studio on its configured site before continuing.');
  }
}

export function assertMutation(req, config, session) {
  assertSameOrigin(req, config, true);
  if (!safeEqual(header(req, 'x-csrf-token'), session.csrf)) throw new StudioError(403, 'csrf_rejected', 'Refresh Studio and try again.');
}

export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

export function endpoint(methods, handler) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie, Origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return json(res, 405, { error: 'Method not allowed.', code: 'method_not_allowed' });
    }
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof StudioError) return json(res, error.status, { error: error.message, code: error.code, ...error.details });
      return json(res, 500, { error: 'Studio could not complete this request.', code: 'studio_error' });
    }
  };
}

export function beginOAuth(config, now = seconds()) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const payload = { v: 1, state, verifier, iat: now, exp: now + OAUTH_TTL };
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.origin}/api/studio/callback`, state, code_challenge: challenge, code_challenge_method: 'S256', login: OWNER_LOGIN, allow_signup: 'false' }).toString();
  return { payload, url: url.href };
}

export function readOAuth(req, config, state, now = seconds()) {
  const payload = unseal(cookieValue(req, OAUTH_COOKIE), 'oauth', config.sessionSecret, now);
  if (!payload || !/^[A-Za-z0-9_-]{43}$/.test(payload.state || '') || !/^[A-Za-z0-9_-]{43}$/.test(payload.verifier || '') || !safeEqual(payload.state, state)) {
    throw new StudioError(400, 'oauth_state_rejected', 'Sign-in expired or could not be verified. Start sign-in again.');
  }
  return payload;
}

async function fetchJSON(url, options = {}, { oauth = false } = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000), redirect: 'error' }); }
  catch (error) {
    const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError';
    throw new StudioError(timedOut ? 504 : 502, timedOut ? 'github_timeout' : 'github_unavailable', 'GitHub could not be reached. Try again shortly.');
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > 1024 * 1024) throw new StudioError(502, 'github_response_invalid', 'GitHub returned an unexpected response.');
  let value;
  try { value = text ? JSON.parse(text) : {}; }
  catch { throw new StudioError(502, 'github_response_invalid', 'GitHub returned an unexpected response.'); }
  if (!response.ok || (oauth && value.error)) {
    const conflict = response.status === 409 || response.status === 422;
    throw new StudioError(conflict ? 409 : oauth ? 401 : 503, conflict ? 'content_conflict' : oauth ? 'oauth_exchange_rejected' : 'github_app_unavailable', conflict ? 'The repository changed. Reload the published content before saving again.' : oauth ? 'GitHub could not verify this sign-in. Start sign-in again.' : 'Check the GitHub App installation and permissions for this repository.', { upstreamStatus: response.status });
  }
  return value;
}

export function githubRequest(path, token, options = {}) {
  return fetchJSON(`https://api.github.com${path}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': API_VERSION, 'User-Agent': 'Yousif-J0-Studio', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
}

export async function exchangeOwner(req, config, code, state) {
  const pending = readOAuth(req, config, state);
  if (typeof code !== 'string' || !code || code.length > 512 || /[\x00-\x1f\x7f]/.test(code)) throw new StudioError(400, 'oauth_code_missing', 'GitHub did not provide a valid sign-in code.');
  let token = await fetchJSON('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Yousif-J0-Studio' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, code_verifier: pending.verifier, redirect_uri: `${config.origin}/api/studio/callback`, repository_id: String(REPOSITORY_ID) }).toString()
  }, { oauth: true });
  if (typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 4096) throw new StudioError(401, 'oauth_token_missing', 'GitHub could not verify this sign-in. Start sign-in again.');
  let user;
  try { user = await githubRequest('/user', token.access_token); }
  finally { token = null; }
  if (user?.id !== OWNER_ID) throw new StudioError(403, 'owner_only', 'This Studio is available only to its owner.');
  return { id: user.id, login: user.login };
}

export function appJWT(config, now = seconds()) {
  const header = encoder(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = encoder(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: config.appId }));
  const data = `${header}.${payload}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), config.privateKey).toString('base64url')}`;
}

export async function installationToken(config) {
  const jwt = appJWT(config);
  const installation = await githubRequest(`/repos/${REPOSITORY}/installation`, jwt);
  if (!Number.isSafeInteger(installation.id) || installation.id < 1 || installation.account?.id !== OWNER_ID || String(installation.app_id) !== config.appId || installation.permissions?.contents !== 'write') {
    throw new StudioError(503, 'installation_rejected', 'Install the configured GitHub App on this repository with Contents write access.');
  }
  const result = await githubRequest(`/app/installations/${installation.id}/access_tokens`, jwt, {
    method: 'POST', body: JSON.stringify({ repository_ids: [REPOSITORY_ID], permissions: { contents: 'write', metadata: 'read' } })
  });
  if (typeof result.token !== 'string' || !result.token || result.permissions?.contents !== 'write') throw new StudioError(503, 'installation_token_rejected', 'GitHub could not grant the required repository access.');
  if (Array.isArray(result.repositories) && (result.repositories.length !== 1 || result.repositories[0]?.id !== REPOSITORY_ID)) throw new StudioError(503, 'installation_scope_rejected', 'GitHub returned an unexpected repository scope.');
  return result.token;
}

export function assertNoContentParameters(req, config) {
  if (new URL(req.url, config.origin).searchParams.size) throw new StudioError(400, 'content_target_fixed', 'The Studio repository, branch and file are configured on the server.');
}

export async function readJSONBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(header(req, 'content-type'))) throw new StudioError(415, 'json_required', 'Send the update as application/json.');
  const length = header(req, 'content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT)) throw new StudioError(413, 'body_too_large', 'The Studio update exceeds the 250 KB limit.');
  let raw;
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
    else if (typeof req.body === 'string') raw = req.body;
    else {
      try { raw = JSON.stringify(req.body); }
      catch { throw new StudioError(400, 'invalid_json', 'The update must contain valid JSON.'); }
    }
  } else {
    raw = await new Promise((resolve, reject) => {
      let size = 0, chunks = [], exceeded = false;
      req.on('data', chunk => {
        size += Buffer.byteLength(chunk);
        if (size > BODY_LIMIT) {
          if (!exceeded) reject(new StudioError(413, 'body_too_large', 'The Studio update exceeds the 250 KB limit.'));
          exceeded = true; chunks = [];
        } else if (!exceeded) chunks.push(Buffer.from(chunk));
      });
      req.on('end', () => { if (!exceeded) resolve(Buffer.concat(chunks).toString('utf8')); });
      req.on('error', () => reject(new StudioError(400, 'invalid_body', 'The update could not be read.')));
    });
  }
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > BODY_LIMIT) throw new StudioError(413, 'body_too_large', 'The Studio update exceeds the 250 KB limit.');
  try { return JSON.parse(raw); }
  catch { throw new StudioError(400, 'invalid_json', 'The update must contain valid JSON.'); }
}

function invalid(field, message) {
  throw new StudioError(422, 'invalid_document', message, { field });
}
function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) invalid(field, `${field} must be an object.`);
}
function string(value, field, max = 4000, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) invalid(field, `${field} has invalid text or exceeds its length limit.`);
}
function array(value, field, max = 100) {
  if (!Array.isArray(value) || value.length > max) invalid(field, `${field} must be an array with at most ${max} items.`);
}

export function validateDocument(document) {
  let nodes = 0;
  const walk = (value, path = 'document', depth = 0) => {
    if (++nodes > 12000 || depth > 16) invalid(path, 'The document is too deeply nested or contains too many values.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) invalid(path, 'Numbers must be finite.'); return; }
    if (typeof value === 'string') { string(value, path, 12000); return; }
    if (Array.isArray(value)) { if (value.length > 500) invalid(path, 'An array contains too many values.'); value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1)); return; }
    object(value, path);
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key) || key.length > 100) invalid(path, 'The document contains an unsupported property.');
      walk(item, `${path}.${key}`, depth + 1);
    }
  };
  walk(document);
  object(document, 'document');
  if (document.schemaVersion !== 1) invalid('schemaVersion', 'This Studio supports schemaVersion 1.');
  object(document.profile, 'profile');
  const p = document.profile;
  for (const key of ['brand', 'name', 'role']) string(p[key], `profile.${key}`, 160, true);
  for (const key of ['location', 'education', 'focus', 'linkedinHandle']) if (p[key] !== undefined) string(p[key], `profile.${key}`, 200);
  for (const key of ['summary', 'disciplines', 'availability']) if (p[key] !== undefined) string(p[key], `profile.${key}`, 4000);
  if (p.email !== undefined) { string(p.email, 'profile.email', 254); if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) invalid('profile.email', 'Enter a valid email address.'); }
  if (p.github !== undefined && p.github !== '') {
    let url;
    try { url = new URL(p.github); } catch { invalid('profile.github', 'Enter a valid HTTPS GitHub URL.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password) invalid('profile.github', 'Enter a valid HTTPS GitHub URL.');
  }
  if (p.about !== undefined) { array(p.about, 'profile.about', 16); p.about.forEach((text, index) => string(text, `profile.about[${index}]`, 4000)); }
  array(document.sections, 'sections', 32);
  if (!document.sections.length) invalid('sections', 'Keep at least one section.');
  if (document.sections[0]?.id !== 'home' || document.sections[0]?.visible !== true) invalid('sections[0]', 'Home must remain the first visible section.');
  const sections = new Set();
  document.sections.forEach((section, index) => {
    const field = `sections[${index}]`; object(section, field);
    if (typeof section.id !== 'string' || !slug.test(section.id) || sections.has(section.id)) invalid(`${field}.id`, 'Section IDs must be unique lowercase slugs.');
    if (reservedSectionIds.has(section.id) || (!builtInSections.has(section.id) && reservedSectionIds.has(`${section.id}-title`))) invalid(`${field}.id`, 'Choose a section ID that does not collide with the page interface.');
    sections.add(section.id); string(section.title, `${field}.title`, 200, true);
    if (typeof section.visible !== 'boolean') invalid(`${field}.visible`, 'Section visibility must be true or false.');
    if (section.description !== undefined) string(section.description, `${field}.description`);
    if (section.eyebrow !== undefined) string(section.eyebrow, `${field}.eyebrow`, 200);
  });
  document.sections.forEach((section, index) => {
    if (sections.has(`${section.id}-title`)) invalid(`sections[${index}].id`, 'Section IDs must not collide with another section heading.');
  });
  const ids = new Set();
  const item = (record, field, destination = false) => {
    object(record, field);
    if (typeof record.id !== 'string' || !slug.test(record.id) || ids.has(record.id)) invalid(`${field}.id`, 'Item IDs must be unique lowercase slugs.');
    ids.add(record.id); string(record.title, `${field}.title`, 200, true);
    if (destination && !sections.has(record.section)) invalid(`${field}.section`, 'Choose a section that exists in this document.');
  };
  array(document.skills, 'skills', 120);
  document.skills.forEach((record, index) => {
    const field = `skills[${index}]`; item(record, field, true); string(record.description, `${field}.description`);
    if (!['defense', 'offense', 'research'].includes(record.category)) invalid(`${field}.category`, 'Choose defense, offense, or research.');
    array(record.tags, `${field}.tags`, 24); record.tags.forEach((text, tagIndex) => string(text, `${field}.tags[${tagIndex}]`, 100, true));
  });
  array(document.learning, 'learning', 120);
  document.learning.forEach((record, index) => {
    const field = `learning[${index}]`; item(record, field, true);
    if (record.status !== 'studying') invalid(`${field}.status`, 'Learning topics must retain their studying status.');
  });
  array(document.experience, 'experience', 40);
  document.experience.forEach((record, index) => { const field = `experience[${index}]`; item(record, field); string(record.period, `${field}.period`, 100); string(record.type, `${field}.type`, 120); string(record.description, `${field}.description`); });
  array(document.training, 'training', 40);
  document.training.forEach((record, index) => {
    const field = `training[${index}]`; item(record, field); string(record.status, `${field}.status`, 80, true); string(record.source, `${field}.source`, 160);
    array(record.items, `${field}.items`, 120); record.items.forEach((text, itemIndex) => string(text, `${field}.items[${itemIndex}]`, 500, true));
  });
  if (document.labs !== undefined) {
    object(document.labs, 'labs'); string(document.labs.summary, 'labs.summary');
    for (const key of ['tags', 'platforms']) { array(document.labs[key], `labs.${key}`, 40); document.labs[key].forEach((text, index) => string(text, `labs.${key}[${index}]`, 160, true)); }
  }
  const bytes = Buffer.byteLength(JSON.stringify(document));
  const storedBytes = Buffer.byteLength(JSON.stringify(document, null, 2) + '\n');
  if (bytes > BODY_LIMIT - 2048 || storedBytes > BODY_LIMIT) throw new StudioError(413, 'document_too_large', 'The content document exceeds the Studio size limit.');
  return document;
}

export async function readContent(config, token) {
  const file = await githubRequest(`/repos/${REPOSITORY}/contents/${CONTENT_PATH}?ref=${encodeURIComponent(config.branch)}`, token);
  if (file.type !== 'file' || file.encoding !== 'base64' || !shaPattern.test(file.sha || '') || !Number.isSafeInteger(file.size) || file.size > BODY_LIMIT || typeof file.content !== 'string') throw new StudioError(502, 'repository_content_invalid', 'The repository content file could not be read.');
  const encoded = file.content.replace(/\s/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > BODY_LIMIT || bytes.toString('base64') !== encoded) throw new StudioError(502, 'repository_content_invalid', 'The repository content file is not valid UTF-8 JSON.');
  let document;
  try { document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new StudioError(502, 'repository_content_invalid', 'The repository content file is not valid UTF-8 JSON.'); }
  validateDocument(document);
  return { document, sha: file.sha, branch: config.branch };
}

export async function writeContent(config, body) {
  object(body, 'request');
  if (Object.keys(body).some(key => !['document', 'sha'].includes(key))) throw new StudioError(400, 'content_target_fixed', 'Only the content document and its current SHA can be submitted.');
  if (!shaPattern.test(body.sha || '')) throw new StudioError(400, 'content_sha_required', 'Reload the published content before saving.');
  validateDocument(body.document);
  const token = await installationToken(config);
  const current = await readContent(config, token);
  if (!safeEqual(current.sha, body.sha)) throw new StudioError(409, 'content_conflict', 'The repository changed. Reload the published content before saving again.');
  const result = await githubRequest(`/repos/${REPOSITORY}/contents/${CONTENT_PATH}`, token, {
    method: 'PUT', body: JSON.stringify({ message: 'Update Yousif.J0 portfolio content from Studio', branch: config.branch, sha: body.sha, content: Buffer.from(JSON.stringify(body.document, null, 2) + '\n').toString('base64') })
  });
  if (!shaPattern.test(result.content?.sha || '') || !shaPattern.test(result.commit?.sha || '')) throw new StudioError(502, 'save_response_invalid', 'GitHub accepted the request but returned an unexpected save result. Reload before saving again.');
  return { saved: true, sha: result.content.sha, branch: config.branch, commitSha: result.commit.sha, url: result.commit.html_url };
}
