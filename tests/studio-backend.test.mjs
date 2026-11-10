import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import * as studio from '../lib/studio.mjs';
import sessionRoute from '../api/studio/session.js';
import loginRoute from '../api/studio/login.js';
import callbackRoute from '../api/studio/callback.js';
import logoutRoute from '../api/studio/logout.js';
import contentRoute from '../api/studio/content.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const envNames = ['GITHUB_APP_ID', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_PRIVATE_KEY', 'STUDIO_SESSION_SECRET', 'STUDIO_ORIGIN', 'CONTENT_BRANCH', 'VERCEL_GIT_COMMIT_REF'];
const fixture = {
  GITHUB_APP_ID: '12345', GITHUB_CLIENT_ID: 'Iv1.StudioFixture', GITHUB_CLIENT_SECRET: 'fixture-client-secret-not-a-real-credential',
  GITHUB_PRIVATE_KEY: privateKey.export({ type: 'pkcs1', format: 'pem' }), STUDIO_SESSION_SECRET: 'fixture-only-session-secret-with-more-than-32-bytes',
  STUDIO_ORIGIN: 'https://studio.example', CONTENT_BRANCH: 'codex/portfolio-redesign-20261109'
};
const document = JSON.parse(readFileSync(new URL('../content.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const currentSHA = 'a'.repeat(40), savedSHA = 'b'.repeat(40), commitSHA = 'c'.repeat(40);

function response() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    end(body = '') { this.body = body; },
    json() { return JSON.parse(this.body); }
  };
}
const request = (method = 'GET', url = '/api/studio/session', headers = {}, body) => ({ method, url, headers, ...(body === undefined ? {} : { body }) });
function credentials() {
  const config = studio.configuration(fixture).config;
  const session = studio.createSession({ id: studio.OWNER_ID, login: studio.OWNER_LOGIN }, config);
  const cookie = `${studio.SESSION_COOKIE}=${studio.seal(session, 'session', config.sessionSecret)}`;
  return { config, session, cookie, headers: { cookie, origin: config.origin, 'content-type': 'application/json', 'x-csrf-token': session.csrf } };
}
function oauthFlow() {
  const config = studio.configuration(fixture).config;
  const flow = studio.beginOAuth(config);
  const cookie = `${studio.OAUTH_COOKIE}=${studio.seal(flow.payload, 'oauth', config.sessionSecret)}`;
  return { config, flow, cookie };
}
function upstream(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
async function mockedFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => { const call = { url: String(url), options }; calls.push(call); return handler(call, calls.length - 1); };
  try { return await run(calls); } finally { globalThis.fetch = original; }
}
function contentFixture(data = document, sha = currentSHA) {
  const text = JSON.stringify(data, null, 2) + '\n';
  return { type: 'file', encoding: 'base64', size: Buffer.byteLength(text), sha, content: Buffer.from(text).toString('base64') };
}
function installationFixture() { return { id: 987, app_id: 12345, account: { id: studio.OWNER_ID }, permissions: { contents: 'write', metadata: 'read' } }; }
function tokenFixture() { return { token: 'fixture-installation-token', permissions: { contents: 'write', metadata: 'read' }, repositories: [{ id: studio.REPOSITORY_ID }] }; }

test('Private Studio authentication and content boundaries', async t => {
  const before = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, fixture);
  delete process.env.VERCEL_GIT_COMMIT_REF;
  try {
    await t.test('missing configuration is an honest 503 without secret values', async () => {
      delete process.env.GITHUB_CLIENT_SECRET;
      const res = response();
      await sessionRoute(request(), res);
      assert.equal(res.statusCode, 503);
      assert.equal(res.json().configured, false);
      assert.equal(res.json().authenticated, false);
      assert.ok(res.json().missing.includes('GITHUB_CLIENT_SECRET'));
      assert.equal(res.body.includes(fixture.STUDIO_SESSION_SECRET), false);
      process.env.GITHUB_CLIENT_SECRET = fixture.GITHUB_CLIENT_SECRET;
      assert.equal(studio.configuration({ ...fixture, STUDIO_ORIGIN: 'http://example.com' }).configured, false);
      assert.equal(studio.configuration({ ...fixture, GITHUB_PRIVATE_KEY: 'invalid' }).configured, false);
    });

    await t.test('signed sessions enforce owner, expiry, purpose, tamper checks and cookie flags', async () => {
      const { config, session, cookie } = credentials();
      assert.equal(studio.readSession(request('GET', '/', { cookie }), config)?.uid, studio.OWNER_ID);
      assert.equal(studio.readSession(request('GET', '/', { cookie: cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A') }), config), null);
      assert.equal(studio.readSession(request('GET', '/', { cookie }), config, session.exp), null);
      const wrongOwner = `${studio.SESSION_COOKIE}=${studio.seal({ ...session, uid: 5 }, 'session', config.sessionSecret)}`;
      assert.equal(studio.readSession(request('GET', '/', { cookie: wrongOwner }), config), null);
      assert.equal(studio.unseal(cookie.slice(cookie.indexOf('=') + 1), 'oauth', config.sessionSecret), null);
      const res = response();
      studio.setCookie(res, studio.SESSION_COOKIE, 'fixture', studio.SESSION_TTL);
      const value = res.headers['set-cookie'][0];
      for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=1800']) assert.ok(value.includes(flag));
      assert.equal(value.includes('Domain='), false);
    });

    await t.test('session endpoint returns only owner identity and a CSRF token', async () => {
      const { cookie, session } = credentials();
      const res = response();
      await sessionRoute(request('GET', '/api/studio/session', { cookie, origin: fixture.STUDIO_ORIGIN }), res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json().user, { id: studio.OWNER_ID, login: studio.OWNER_LOGIN });
      assert.equal(res.json().csrfToken, session.csrf);
      assert.equal(res.body.includes('fixture-client-secret'), false);
      assert.ok(res.headers['cache-control'].includes('no-store'));
      const foreign = response();
      await sessionRoute(request('GET', '/api/studio/session', { cookie, origin: 'https://foreign.example' }), foreign);
      assert.equal(foreign.statusCode, 403);
    });

    await t.test('login uses state and S256 PKCE with a signed HttpOnly Lax flow cookie', async () => {
      const res = response();
      await loginRoute(request('GET', '/api/studio/login', { origin: fixture.STUDIO_ORIGIN }), res);
      assert.equal(res.statusCode, 302);
      const target = new URL(res.headers.location);
      assert.equal(target.origin, 'https://github.com');
      assert.equal(target.pathname, '/login/oauth/authorize');
      assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(target.searchParams.get('redirect_uri'), `${fixture.STUDIO_ORIGIN}/api/studio/callback`);
      assert.equal(target.searchParams.has('scope'), false);
      const cookie = res.headers['set-cookie'][0];
      assert.ok(cookie.includes('HttpOnly; Secure; SameSite=Lax'));
      const flow = studio.unseal(cookie.split(';')[0].split('=')[1], 'oauth', fixture.STUDIO_SESSION_SECRET);
      assert.equal(flow.state, target.searchParams.get('state'));
      assert.equal(createHash('sha256').update(flow.verifier).digest('base64url'), target.searchParams.get('code_challenge'));
    });

    await t.test('callback verifies PKCE and immutable owner ID without retaining OAuth tokens', async () => {
      const { config, flow, cookie } = oauthFlow();
      await mockedFetch((call, index) => {
        if (index === 0) {
          assert.equal(call.url, 'https://github.com/login/oauth/access_token');
          const body = new URLSearchParams(call.options.body);
          assert.equal(body.get('code_verifier'), flow.payload.verifier);
          assert.equal(body.get('repository_id'), String(studio.REPOSITORY_ID));
          return upstream({ access_token: 'fixture-user-token' });
        }
        assert.equal(call.url, 'https://api.github.com/user');
        return upstream({ id: studio.OWNER_ID, login: studio.OWNER_LOGIN });
      }, async calls => {
        const res = response();
        await callbackRoute(request('GET', `/api/studio/callback?code=fixture-code&state=${flow.payload.state}`, { cookie }), res);
        assert.equal(res.statusCode, 302);
        assert.equal(res.headers.location, `${fixture.STUDIO_ORIGIN}/studio.html`);
        assert.equal(calls.length, 2);
        const sessionCookie = res.headers['set-cookie'].find(value => value.startsWith(`${studio.SESSION_COOKIE}=`));
        assert.ok(sessionCookie);
        const session = studio.unseal(sessionCookie.split(';')[0].split('=')[1], 'session', config.sessionSecret);
        assert.equal(session.uid, studio.OWNER_ID);
        assert.equal(JSON.stringify(session).includes('fixture-user-token'), false);
        assert.equal(Object.hasOwn(session, 'access_token'), false);
      });
    });

    await t.test('wrong state makes no external request and a different GitHub user is denied', async () => {
      const { flow, cookie } = oauthFlow();
      await mockedFetch(() => { throw new Error('Must not fetch'); }, async calls => {
        const res = response();
        await callbackRoute(request('GET', '/api/studio/callback?code=fixture&state=wrong', { cookie }), res);
        assert.equal(res.statusCode, 400);
        assert.equal(calls.length, 0);
        assert.equal(res.headers['set-cookie'], undefined);
      });
      await mockedFetch((call, index) => upstream(index === 0 ? { access_token: 'fixture-user-token' } : { id: 99, login: 'another-user' }), async () => {
        const res = response();
        await callbackRoute(request('GET', `/api/studio/callback?code=fixture&state=${flow.payload.state}`, { cookie }), res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().code, 'owner_only');
        assert.equal(res.headers['set-cookie'].some(value => value.startsWith(`${studio.SESSION_COOKIE}=`)), false);
      });
    });

    await t.test('App JWT is correctly signed and installation tokens target one repository', async () => {
      const { config } = credentials();
      const jwt = studio.appJWT(config);
      const [head, payload, signature] = jwt.split('.');
      assert.equal(JSON.parse(Buffer.from(head, 'base64url')).alg, 'RS256');
      const claims = JSON.parse(Buffer.from(payload, 'base64url'));
      assert.equal(claims.iss, fixture.GITHUB_APP_ID);
      assert.ok(claims.exp - claims.iat <= 600);
      assert.equal(verify('RSA-SHA256', Buffer.from(`${head}.${payload}`), publicKey, Buffer.from(signature, 'base64url')), true);
      await mockedFetch((call, index) => {
        if (index === 0) { assert.equal(call.url, `https://api.github.com/repos/${studio.REPOSITORY}/installation`); return upstream(installationFixture()); }
        assert.equal(call.url, 'https://api.github.com/app/installations/987/access_tokens');
        assert.deepEqual(JSON.parse(call.options.body), { repository_ids: [studio.REPOSITORY_ID], permissions: { contents: 'write', metadata: 'read' } });
        return upstream(tokenFixture());
      }, async () => assert.equal(await studio.installationToken(config), 'fixture-installation-token'));
    });

    await t.test('content requires a session and rejects client-selected targets', async () => {
      const { headers } = credentials();
      await mockedFetch(() => { throw new Error('Must not fetch'); }, async calls => {
        const unauthenticated = response();
        await contentRoute(request('GET', '/api/studio/content'), unauthenticated);
        assert.equal(unauthenticated.statusCode, 401);
        const target = response();
        await contentRoute(request('GET', '/api/studio/content?branch=main', headers), target);
        assert.equal(target.statusCode, 400);
        const payloadTarget = response();
        await contentRoute(request('PUT', '/api/studio/content', headers, { document, sha: currentSHA, branch: 'main' }), payloadTarget);
        assert.equal(payloadTarget.statusCode, 400);
        assert.equal(calls.length, 0);
      });
    });

    await t.test('writes require same-origin, CSRF and JSON; body size is capped', async () => {
      const { headers } = credentials();
      await mockedFetch(() => { throw new Error('Must not fetch'); }, async calls => {
        for (const change of [{ origin: '' }, { origin: 'https://foreign.example' }, { 'x-csrf-token': '' }]) {
          const res = response();
          await contentRoute(request('PUT', '/api/studio/content', { ...headers, ...change }, { document, sha: currentSHA }), res);
          assert.equal(res.statusCode, 403);
        }
        const media = response();
        await contentRoute(request('PUT', '/api/studio/content', { ...headers, 'content-type': 'text/plain' }, '{}'), media);
        assert.equal(media.statusCode, 415);
        const size = response();
        await contentRoute(request('PUT', '/api/studio/content', headers, ' '.repeat(studio.BODY_LIMIT + 1)), size);
        assert.equal(size.statusCode, 413);
        assert.equal(calls.length, 0);
      });
      const streamed = Readable.from([Buffer.alloc(studio.BODY_LIMIT), Buffer.from('x')]);
      streamed.headers = { 'content-type': 'application/json' };
      await assert.rejects(studio.readJSONBody(streamed), error => error.status === 413);
    });

    await t.test('custom sections and unknown data round-trip, while invalid references and prototype keys fail', () => {
      const future = clone(document);
      future.sections.push({ id: 'future-lab', title: 'Future lab', visible: true, description: 'Custom section.' });
      future.skills[0].section = 'future-lab';
      future.futureSetting = { enabled: true, label: '<b>text only</b>' };
      assert.equal(studio.validateDocument(future), future);
      assert.equal(future.futureSetting.label, '<b>text only</b>');
      const badReference = clone(document); badReference.skills[0].section = 'missing';
      assert.throws(() => studio.validateDocument(badReference), error => error.status === 422);
      const duplicate = clone(document); duplicate.learning[0].id = duplicate.skills[0].id;
      assert.throws(() => studio.validateDocument(duplicate), error => error.status === 422);
      const badVersion = clone(document); badVersion.schemaVersion = 99;
      assert.throws(() => studio.validateDocument(badVersion), error => error.status === 422);
      const pollution = JSON.parse(JSON.stringify(document).replace('"schemaVersion":1', '"schemaVersion":1,"__proto__":{}'));
      assert.throws(() => studio.validateDocument(pollution), error => error.status === 422);
      const oversized = clone(document); oversized.profile.name = 'x'.repeat(161);
      assert.throws(() => studio.validateDocument(oversized), error => error.status === 422);
    });

    await t.test('home remains first and visible in every accepted document', () => {
      const hidden = clone(document); hidden.sections[0].visible = false;
      assert.throws(() => studio.validateDocument(hidden), error => error.status === 422);
      const reordered = clone(document); [reordered.sections[0], reordered.sections[1]] = [reordered.sections[1], reordered.sections[0]];
      assert.throws(() => studio.validateDocument(reordered), error => error.status === 422);
      const absent = clone(document); absent.sections = absent.sections.filter(section => section.id !== 'home');
      assert.throws(() => studio.validateDocument(absent), error => error.status === 422);
    });

    await t.test('custom IDs cannot overwrite interface IDs or another section heading', () => {
      for (const id of ['main', 'year', 'site-data', 'site-schema', 'home-title', 'about-title', 'observatory', 'observatory-title', 'observatory-map-note']) {
        const update = clone(document); update.sections.push({ id, title: 'Custom section', visible: true });
        assert.throws(() => studio.validateDocument(update), error => error.status === 422);
      }
      const collision = clone(document);
      collision.sections.push({ id: 'future-lab', title: 'Future lab', visible: true }, { id: 'future-lab-title', title: 'Another section', visible: true });
      assert.throws(() => studio.validateDocument(collision), error => error.status === 422);
    });

    await t.test('optional renderer content may be omitted without invalidating a future document', () => {
      const update = clone(document);
      delete update.profile.about;
      delete update.profile.github;
      delete update.labs;
      assert.equal(studio.validateDocument(update), update);
    });

    await t.test('a stale SHA is a 409 and never writes to GitHub', async () => {
      const { headers } = credentials();
      await mockedFetch((call, index) => upstream(index === 0 ? installationFixture() : index === 1 ? tokenFixture() : contentFixture()), async calls => {
        const res = response();
        await contentRoute(request('PUT', '/api/studio/content', headers, { document, sha: 'd'.repeat(40) }), res);
        assert.equal(res.statusCode, 409);
        assert.equal(calls.some(call => call.options.method === 'PUT'), false);
      });
    });

    await t.test('a compact update cannot save a formatted file larger than the reader limit', () => {
      const update = clone(document);
      update.futureRows = Array.from({ length: 450 }, () => ({ value: '' }));
      const baseBytes = Buffer.byteLength(JSON.stringify(update));
      const valueLength = Math.floor((studio.BODY_LIMIT - 4096 - baseBytes) / update.futureRows.length);
      assert.ok(valueLength > 0);
      update.futureRows.forEach(row => { row.value = 'x'.repeat(valueLength); });
      assert.ok(Buffer.byteLength(JSON.stringify(update)) < studio.BODY_LIMIT - 2048);
      assert.ok(Buffer.byteLength(JSON.stringify(update, null, 2) + '\n') > studio.BODY_LIMIT);
      assert.throws(() => studio.validateDocument(update), error => error.status === 413 && error.code === 'document_too_large');
    });

    await t.test('a valid save commits only content.json on the server branch and preserves unknown fields', async () => {
      const { headers } = credentials();
      const update = clone(document); update.futureSetting = { note: 'preserved' };
      await mockedFetch((call, index) => {
        if (index === 0) return upstream(installationFixture());
        if (index === 1) return upstream(tokenFixture());
        if (index === 2) { assert.ok(call.url.endsWith(`?ref=${encodeURIComponent(fixture.CONTENT_BRANCH)}`)); return upstream(contentFixture()); }
        assert.equal(call.url, `https://api.github.com/repos/${studio.REPOSITORY}/contents/content.json`);
        assert.equal(call.options.method, 'PUT');
        const body = JSON.parse(call.options.body);
        assert.equal(body.branch, fixture.CONTENT_BRANCH);
        assert.equal(body.sha, currentSHA);
        assert.equal(JSON.parse(Buffer.from(body.content, 'base64')).futureSetting.note, 'preserved');
        return upstream({ content: { sha: savedSHA }, commit: { sha: commitSHA, html_url: `https://github.com/${studio.REPOSITORY}/commit/${commitSHA}` } });
      }, async calls => {
        const res = response();
        await contentRoute(request('PUT', '/api/studio/content', headers, { document: update, sha: currentSHA }), res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().saved, true);
        assert.equal(res.json().sha, savedSHA);
        assert.equal(res.json().branch, fixture.CONTENT_BRANCH);
        assert.equal(calls.length, 4);
      });
    });

    await t.test('logout checks CSRF and clears both host-only cookies', async () => {
      const { headers } = credentials();
      const bad = response();
      await logoutRoute(request('POST', '/api/studio/logout', { ...headers, 'x-csrf-token': 'wrong' }), bad);
      assert.equal(bad.statusCode, 403);
      const res = response();
      await logoutRoute(request('POST', '/api/studio/logout', headers), res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().authenticated, false);
      assert.equal(res.headers['set-cookie'].length, 2);
      assert.ok(res.headers['set-cookie'].every(value => value.includes('Max-Age=0') && value.includes('Secure')));
    });

    await t.test('unsupported methods and upstream errors remain bounded and do not reveal credentials', async () => {
      const wrongMethod = response();
      await contentRoute(request('POST', '/api/studio/content'), wrongMethod);
      assert.equal(wrongMethod.statusCode, 405);
      assert.equal(wrongMethod.headers.allow, 'GET, PUT');
      const { headers } = credentials();
      await mockedFetch(() => upstream({ message: 'fixture-upstream-sensitive-detail' }, 403), async () => {
        const res = response();
        await contentRoute(request('GET', '/api/studio/content', headers), res);
        assert.equal(res.statusCode, 503);
        assert.equal(res.body.includes('fixture-upstream-sensitive-detail'), false);
        assert.equal(res.body.includes(fixture.GITHUB_CLIENT_SECRET), false);
      });
    });
  } finally {
    for (const name of envNames) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; }
  }
});
