import { assertMutation, assertNoContentParameters, assertSameOrigin, endpoint, installationToken, json, readContent, readJSONBody, requireConfiguration, requireSession, writeContent } from '../../lib/studio.mjs';

export default endpoint(['GET', 'PUT'], async (req, res) => {
  const config = requireConfiguration();
  const session = requireSession(req, config);
  assertSameOrigin(req, config);
  assertNoContentParameters(req, config);
  if (req.method === 'GET') {
    const token = await installationToken(config);
    return json(res, 200, await readContent(config, token));
  }
  assertMutation(req, config, session);
  const body = await readJSONBody(req);
  json(res, 200, await writeContent(config, body));
});
