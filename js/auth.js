// Google OAuth 2.0 in the browser, using the redirect-based token flow.
//
// A redirect (not a popup) is used on purpose: popups do not return to an
// iOS home-screen web app, while a same-window redirect works everywhere.
// The access token lives only on this device and expires after ~1 hour;
// renewing it is a silent redirect (prompt=none) once Google knows the app.

import { load, save } from './store.js';
import { WEATHERNEXT } from './config.js';

const TOKEN_KEY = 'token';
const STATE_KEY = 'skycast:oauth-state';
const SILENT_KEY = 'skycast:silent-tried';

export function redirectUri() {
  // The app's own base URL, e.g. https://user.github.io/weathernext-app/
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

/** Parses a token response in the URL fragment, if present. */
export function consumeRedirect() {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) {
    return null;
  }
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);

  let expected = null;
  try { expected = sessionStorage.getItem(STATE_KEY); } catch { /* ignore */ }
  if (!expected || params.get('state') !== expected) {
    return { error: 'state_mismatch' };
  }
  if (params.get('error')) return { error: params.get('error') };

  const token = {
    accessToken: params.get('access_token'),
    expiresAt: Date.now() + Number(params.get('expires_in') || 3600) * 1000,
  };
  save(TOKEN_KEY, token);
  save('signedInBefore', true);
  try { sessionStorage.removeItem(SILENT_KEY); } catch { /* ignore */ }
  return { token };
}

/** Returns a token that is valid for at least another minute, or null. */
export function currentToken() {
  const token = load(TOKEN_KEY, null);
  if (!token || token.expiresAt - 60_000 < Date.now()) return null;
  return token;
}

export function hasSignedInBefore() {
  return load('signedInBefore', false);
}

/** Tries a silent renewal only once per browsing session to avoid loops. */
export function canTrySilent() {
  try { return !sessionStorage.getItem(SILENT_KEY); } catch { return false; }
}

export function signIn(clientId, { silent = false } = {}) {
  const state = crypto.randomUUID();
  try {
    sessionStorage.setItem(STATE_KEY, state);
    if (silent) sessionStorage.setItem(SILENT_KEY, '1');
  } catch { /* ignore */ }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: WEATHERNEXT.scope,
    include_granted_scopes: 'true',
    state,
  });
  if (silent) params.set('prompt', 'none');
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + params);
}

export function signOut() {
  const token = load(TOKEN_KEY, null);
  save(TOKEN_KEY, undefined);
  save('signedInBefore', undefined);
  if (token) {
    fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token.accessToken), {
      method: 'POST',
    }).catch(() => {});
  }
}
