const TOKEN_KEY = 'clicktopay.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.status = status;
    this.details = details ?? [];
  }

  /** Erreurs de validation indexées par nom de champ, pour l'affichage sous les libellés. */
  get fieldErrors() {
    return Object.fromEntries(this.details.map((d) => [d.champ, d.message]));
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    // Laisse le routeur renvoyer vers la page de connexion au prochain rendu.
    window.dispatchEvent(new Event('clicktopay:unauthorized'));
  }

  const payload = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(payload?.error ?? `Erreur ${res.status}`, {
      status: res.status,
      details: payload?.details,
    });
  }
  return payload;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),

  sectors: () => request('/mcc/secteurs'),
  searchMcc: (search, { eligibleOnly = true, limit = 40 } = {}) =>
    request(`/mcc?search=${encodeURIComponent(search)}&limit=${limit}&eligibleOnly=${eligibleOnly}`),
  getMcc: (code) => request(`/mcc/${code}`),
  suggest: (profile, signal) => request('/mcc/suggest', { method: 'POST', body: profile, signal }),

  listRequests: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return request(`/requests${qs ? `?${qs}` : ''}`);
  },
  stats: () => request('/requests/stats'),
  getRequest: (id) => request(`/requests/${id}`),
  createRequest: (payload) => request('/requests', { method: 'POST', body: payload }),
  updateRequest: (id, payload) => request(`/requests/${id}`, { method: 'PUT', body: payload }),
  submitRequest: (id) => request(`/requests/${id}/submit`, { method: 'POST' }),
  decide: (id, payload) => request(`/requests/${id}/decision`, { method: 'POST', body: payload }),
  suggestionsSnapshot: (id) => request(`/requests/${id}/suggestions`),
  events: (id) => request(`/requests/${id}/events`),
};
