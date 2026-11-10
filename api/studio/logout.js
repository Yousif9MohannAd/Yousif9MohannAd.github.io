import { assertMutation, clearCookie, endpoint, json, OAUTH_COOKIE, requireConfiguration, requireSession, SESSION_COOKIE } from '../../lib/studio.mjs';

export default endpoint(['POST'], async (req, res) => {
  const config = requireConfiguration();
  const session = requireSession(req, config);
  assertMutation(req, config, session);
  clearCookie(res, SESSION_COOKIE);
  clearCookie(res, OAUTH_COOKIE, 'Lax');
  json(res, 200, { authenticated: false, configured: true });
});
