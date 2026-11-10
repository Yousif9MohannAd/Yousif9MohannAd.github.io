(() => {
  "use strict";
  const PATH = Object.freeze({ session: "/api/studio/session", login: "/api/studio/login", logout: "/api/studio/logout", content: "/api/studio/content" });
  const OWNER_ID = 185284854;
  const SHA = /^[a-f0-9]{40}$/;
  let csrfToken = null;
  let generation = 0;
  let refreshPromise = null;
  let disconnectPublisher = null;
  const api = () => window.YousifStudio;

  function apiError(status, code, message, payload) {
    const error = new Error(message);
    error.status = status; error.code = code; error.payload = payload;
    return error;
  }
  function clearConnection() {
    csrfToken = null;
    if (disconnectPublisher) disconnectPublisher();
    disconnectPublisher = null;
  }
  const actions = { onLogin: () => { clearConnection(); location.assign(PATH.login); }, onLogout: logout, onRefresh: refreshSession };
  function connection(state, details = {}) { api()?.setConnection({ state, ...details, ...actions }); }

  async function request(path, { method = "GET", body, signal, mutation = false } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, path === PATH.session ? 10000 : 30000);
    try {
      if (mutation && !csrfToken) throw apiError(401, "sign_in_required", "Sign in again before saving online.");
      const response = await fetch(path, {
        method, credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(mutation ? { "X-CSRF-Token": csrfToken } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      const raw = await response.text();
      if (raw.length > 400000) throw apiError(502, "response_invalid", "The Studio returned an unexpected response.");
      let payload;
      try { payload = JSON.parse(raw); }
      catch { throw apiError(response.status || 502, "api_unavailable", "The private Studio connection is unavailable on this site."); }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw apiError(502, "response_invalid", "The Studio returned an unexpected response.");
      if (!response.ok) {
        if (response.status === 401) { clearConnection(); connection("signedOut", { message: "Your owner session ended. Sign in again to load and save online; your device draft is retained." }); }
        if (response.status === 403 && payload.code === "csrf_rejected") { clearConnection(); connection("error", { message: "Session verification changed. Check the connection before saving again. Your draft has been retained." }); }
        throw apiError(response.status, typeof payload.code === "string" ? payload.code : "studio_error", typeof payload.error === "string" ? payload.error : "The Studio could not complete this request.", payload);
      }
      return payload;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  async function logout() {
    const endedGeneration = ++generation;
    try { await request(PATH.logout, { method: "POST", mutation: true }); }
    catch (error) { if (error.status !== 401) throw error; }
    if (generation !== endedGeneration) return;
    clearConnection(); connection("signedOut");
  }

  async function checkSession() {
    const studio = api();
    if (!studio || studio.getState().busy) return false;
    const requestGeneration = ++generation;
    clearConnection(); connection("loading");
    try {
      const session = await request(PATH.session);
      if (requestGeneration !== generation) return false;
      if (session.configured !== true || typeof session.authenticated !== "boolean") throw apiError(502, "session_invalid", "The Studio returned an unexpected session response.");
      if (!session.authenticated) { connection("signedOut"); return false; }
      if (session.user?.id !== OWNER_ID || typeof session.user.login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(session.user.login) || typeof session.csrfToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(session.csrfToken)) throw apiError(502, "session_invalid", "The owner session could not be verified.");
      csrfToken = session.csrfToken;
      let contentLoaded = false;
      let loadedSHA = null;
      const assertSession = () => {
        if (requestGeneration !== generation || !csrfToken) throw apiError(401, "sign_in_required", "Sign in again before saving online.");
      };
      connection("signedIn", { userLabel: session.user.login });
      disconnectPublisher = studio.connectPublisher({
        label: session.user.login,
        async load() {
          assertSession();
          const result = await request(PATH.content);
          assertSession();
          if (!SHA.test(result.sha || "") || typeof result.branch !== "string" || studio.validateDocument(result.document).length) throw apiError(502, "content_invalid", "The online content could not be verified.");
          loadedSHA = result.sha; contentLoaded = true;
          return result;
        },
        async save({ document, sha, signal }) {
          assertSession();
          if (!contentLoaded || !SHA.test(sha || "") || sha !== loadedSHA) throw apiError(409, "content_conflict", "Load the latest online content before saving.");
          const result = await request(PATH.content, { method: "PUT", mutation: true, body: { document, sha }, signal });
          assertSession();
          if (result.saved !== true || !SHA.test(result.sha || "") || typeof result.branch !== "string") throw apiError(502, "save_unconfirmed", "The save response could not be verified. Reload before trying again.");
          loadedSHA = result.sha;
          return result;
        }
      });
      await studio.loadOnline();
      return true;
    } catch (error) {
      if (requestGeneration !== generation) return false;
      clearConnection();
      if (error.status === 503 && error.payload?.configured === false) {
        connection("unconfigured", { message: "Owner sign-in and online saving are not configured for this deployment yet. Local drafts and JSON export remain available." });
      } else if (error.status === 401) connection("signedOut");
      else if (error.code === "origin_rejected") connection("error", { message: "Open the configured Studio site to use owner sign-in. This address cannot access its private session. Your device draft is retained." });
      else connection("error", { message: "The private Studio connection could not be confirmed. Check the connection to try again, or continue with a device draft and export." });
      return false;
    }
  }
  function refreshSession() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = checkSession().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  window.addEventListener("studio:session-request", refreshSession);
  if (api()) refreshSession();
  else window.addEventListener("studio:ready", refreshSession, { once: true });
})();
