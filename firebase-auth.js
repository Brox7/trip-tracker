/* =========================================================
   Google sign-in without the Firebase SDK.

   1. Google's own script hands us a Google ID token when someone signs in.
   2. We trade that for a Firebase token via the identitytoolkit REST endpoint.
   3. Every database call carries ?auth=<token>. The database rules check the
      email inside it against the allowed list.

   Firebase tokens last an hour, so we refresh before they expire. Reading the
   app offline never needs a token — only talking to the database does.
   ========================================================= */

const AUTH_STORE = 'th-trip-auth';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

const Auth = {
  email: '', name: '', picture: '',
  idToken: '', refreshToken: '', expiresAt: 0,
  ready: false,
  onChange: () => {}
};

function loadAuth() {
  try {
    const a = JSON.parse(localStorage.getItem(AUTH_STORE) || 'null');
    if (a) Object.assign(Auth, a);
  } catch {}
  return Auth.email;
}
function persistAuth() {
  const { email, name, picture, idToken, refreshToken, expiresAt } = Auth;
  localStorage.setItem(AUTH_STORE, JSON.stringify({ email, name, picture, idToken, refreshToken, expiresAt }));
}
function clearAuth() {
  Object.assign(Auth, { email:'', name:'', picture:'', idToken:'', refreshToken:'', expiresAt:0 });
  localStorage.removeItem(AUTH_STORE);
  Auth.onChange();
}
const signedIn = () => Boolean(Auth.refreshToken);

/* what the database wants on every request */
async function authToken() {
  if (!Auth.refreshToken) return '';
  if (Auth.idToken && Date.now() < Auth.expiresAt - 5 * 60 * 1000) return Auth.idToken;
  try {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${window.TRIP_KEY_API}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(Auth.refreshToken)}`
    });
    if (!res.ok) throw new Error(`refresh ${res.status}`);
    const d = await res.json();
    Auth.idToken = d.id_token;
    Auth.refreshToken = d.refresh_token || Auth.refreshToken;
    Auth.expiresAt = Date.now() + (Number(d.expires_in) || 3600) * 1000;
    persistAuth();
    return Auth.idToken;
  } catch (e) {
    console.warn('[auth] could not refresh:', e.message);
    return Auth.idToken || '';       // let the stale one fail loudly rather than silently signing out
  }
}

/* trade a Google credential for a Firebase one */
async function exchangeGoogleCredential(credential) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${window.TRIP_KEY_API}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${credential}&providerId=google.com`,
        requestUri: location.origin,
        returnIdpCredential: true,
        returnSecureToken: true
      })
    });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || `sign-in failed (${res.status})`);
  Auth.email = d.email || '';
  Auth.name = d.displayName || d.fullName || '';
  Auth.picture = d.photoUrl || '';
  Auth.idToken = d.idToken;
  Auth.refreshToken = d.refreshToken;
  Auth.expiresAt = Date.now() + (Number(d.expiresIn) || 3600) * 1000;
  persistAuth();
  Auth.onChange();
  return Auth.email;
}

/* Google's button */
function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google sign-in script could not load — check your connection'));
    document.head.appendChild(s);
  });
}

async function mountSignIn(el, onDone) {
  if (!el) return;
  try {
    await loadGIS();
    google.accounts.id.initialize({
      client_id: window.TRIP_CLIENT_ID,
      callback: async ({ credential }) => {
        try { await exchangeGoogleCredential(credential); onDone && onDone(null, Auth.email); }
        catch (e) { onDone && onDone(e); }
      }
    });
    el.innerHTML = '';
    google.accounts.id.renderButton(el, { theme:'outline', size:'large', text:'signin_with', shape:'pill' });
    Auth.ready = true;
  } catch (e) {
    el.innerHTML = `<span class="hint">${e.message}</span>`;
  }
}

if (typeof window !== 'undefined') {
  window.TripAuth = { Auth, loadAuth, clearAuth, signedIn, authToken, mountSignIn };
}
