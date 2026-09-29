// Cognito sign-in with plain fetch (DEPLOYMENT-PLAN.md section 2): InitiateAuth with
// USER_PASSWORD_AUTH, then REFRESH_TOKEN_AUTH. No SDK, no redirects.
// The ID token stays in memory; only the refresh token is kept in localStorage.

import { config } from '../config.js';

const ENDPOINT = `https://cognito-idp.${config.region}.amazonaws.com/`;
const REFRESH_KEY = 'strength.refreshToken';
const EARLY_MS = 60_000; // refresh a minute before the ID token expires

// kind: 'not_authorized' | 'unavailable' | 'throttled' | 'network' | 'signed_out' | 'error'
export class AuthError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'AuthError';
    this.kind = kind;
  }
}

let session = null; // { idToken, expiresAt }
let refreshing = null;

function readRefreshToken() {
  try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
}
function writeRefreshToken(token) {
  try { localStorage.setItem(REFRESH_KEY, token); } catch { /* signed in for this page load only */ }
}
function clearRefreshToken() {
  try { localStorage.removeItem(REFRESH_KEY); } catch { /* nothing to clear */ }
}

async function cognito(target, body) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('network', 'Cannot reach the sign-in service.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (res.ok) return data ?? {};

  const type = String(data?.__type ?? '').split('#').pop();
  if (type === 'NotAuthorizedException' || type === 'UserNotFoundException') {
    throw new AuthError('not_authorized', 'Not authorized.');
  }
  if (type === 'PasswordResetRequiredException' || type === 'UserNotConfirmedException') {
    throw new AuthError('unavailable', 'Sign-in unavailable.');
  }
  if (type === 'TooManyRequestsException' || type === 'LimitExceededException') {
    throw new AuthError('throttled', 'Too many attempts.');
  }
  throw new AuthError('error', `Sign-in service error (${res.status}).`);
}

// Any challenge (new password, MFA, ...) means the account is not set up as the plan expects.
function readResult(data) {
  const r = data.AuthenticationResult;
  if (data.ChallengeName || !r?.IdToken) throw new AuthError('unavailable', 'Sign-in unavailable.');
  return r;
}

function adopt(result) {
  session = { idToken: result.IdToken, expiresAt: Date.now() + (result.ExpiresIn ?? 3600) * 1000 };
}

export const hasRefreshToken = () => Boolean(readRefreshToken());

export async function signIn(email, password) {
  const data = await cognito('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: config.userPoolClientId,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  const result = readResult(data);
  if (!result.RefreshToken) throw new AuthError('unavailable', 'Sign-in unavailable.');
  writeRefreshToken(result.RefreshToken);
  adopt(result);
}

async function doRefresh() {
  const refreshToken = readRefreshToken();
  if (!refreshToken) throw new AuthError('signed_out', 'Signed out.');
  let data;
  try {
    data = await cognito('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: config.userPoolClientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    });
  } catch (err) {
    // Expired or revoked: ask for the password again. Network errors keep the token.
    if (err.kind === 'not_authorized') {
      clearRefreshToken();
      session = null;
      throw new AuthError('signed_out', 'Your session expired.');
    }
    throw err;
  }
  const result = readResult(data);
  if (result.RefreshToken) writeRefreshToken(result.RefreshToken); // only present if rotation is on
  adopt(result);
}

// Returns a valid ID token, refreshing it when needed. Concurrent callers share one refresh.
export async function getIdToken({ force = false } = {}) {
  if (!force && session && session.expiresAt - Date.now() > EARLY_MS) return session.idToken;
  refreshing ??= doRefresh().finally(() => { refreshing = null; });
  await refreshing;
  return session.idToken;
}

export async function signOut() {
  const refreshToken = readRefreshToken();
  clearRefreshToken();
  session = null;
  if (refreshToken) {
    // Best effort: invalidate the refresh token server-side too.
    try { await cognito('RevokeToken', { ClientId: config.userPoolClientId, Token: refreshToken }); } catch { /* already signed out locally */ }
  }
}
