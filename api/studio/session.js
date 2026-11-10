import { assertSameOrigin, configuration, endpoint, json, readSession } from '../../lib/studio.mjs';

export default endpoint(['GET'], async (req, res) => {
  const result = configuration();
  if (!result.configured) return json(res, 503, { authenticated: false, configured: false, missing: result.missing, invalid: result.invalid, error: 'Private Studio is not configured yet.' });
  assertSameOrigin(req, result.config);
  const session = readSession(req, result.config);
  json(res, 200, { authenticated: Boolean(session), configured: true, ...(session ? { user: { id: session.uid, login: session.login }, csrfToken: session.csrf } : {}) });
});
