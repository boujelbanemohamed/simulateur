// Auth + API helpers for the dashboard. Token kept in localStorage (this is a
// local dev app, not a sandboxed artifact).

const TOKEN_KEY = "fx_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function login(username, password) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Échec de la connexion");
  setToken(data.token);
  return data;
}

export async function logout() {
  const t = getToken();
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${t}` } });
  } catch { /* ignore */ }
  clearToken();
}

// Throws Error("UNAUTH") on 401 so callers can bounce back to the login screen.
export async function authedFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 401) { clearToken(); throw new Error("UNAUTH"); }
  return res;
}
