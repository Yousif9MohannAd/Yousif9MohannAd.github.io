import { clearCookie, createSession, endpoint, exchangeOwner, OAUTH_COOKIE, readOAuth, redirect, requireConfiguration, seal, SESSION_COOKIE, SESSION_TTL, setCookie, StudioError } from '../../lib/studio.mjs';

export default endpoint(['GET'], async (req, res) => {
  const config = requireConfiguration();
  const query = new URL(req.url, config.origin).searchParams;
  if (query.getAll('state').length !== 1 || query.getAll('code').length > 1) throw new StudioError(400, 'oauth_parameters_invalid', 'Start sign-in again from Studio.');
  readOAuth(req, config, query.get('state'));
  clearCookie(res, OAUTH_COOKIE, 'Lax');
  if (query.has('error')) throw new StudioError(400, 'oauth_cancelled', 'GitHub sign-in was not completed. You can start again from Studio.');
  const user = await exchangeOwner(req, config, query.get('code'), query.get('state'));
  const session = createSession(user, config);
  setCookie(res, SESSION_COOKIE, seal(session, 'session', config.sessionSecret), SESSION_TTL);
  redirect(res, `${config.origin}/studio.html`);
});
