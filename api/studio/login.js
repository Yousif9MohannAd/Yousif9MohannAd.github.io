import { assertSameOrigin, beginOAuth, endpoint, OAUTH_COOKIE, OAUTH_TTL, redirect, requireConfiguration, seal, setCookie } from '../../lib/studio.mjs';

export default endpoint(['GET'], async (req, res) => {
  const config = requireConfiguration();
  assertSameOrigin(req, config);
  const flow = beginOAuth(config);
  setCookie(res, OAUTH_COOKIE, seal(flow.payload, 'oauth', config.sessionSecret), OAUTH_TTL, 'Lax');
  redirect(res, flow.url);
});
