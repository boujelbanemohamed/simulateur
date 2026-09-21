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

/** Sérialise des paramètres de requête en ignorant les valeurs vides. */
const qs = (params) => {
  const chaine = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  ).toString();
  return chaine ? `?${chaine}` : '';
};

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),

  sectors: () => request('/mcc/secteurs'),
  searchMcc: (search, { eligibleOnly = true, limit = 40 } = {}) =>
    request(`/mcc?search=${encodeURIComponent(search)}&limit=${limit}&eligibleOnly=${eligibleOnly}`),
  getMcc: (code) => request(`/mcc/${code}`),
  suggest: (profile, signal) => request('/mcc/suggest', { method: 'POST', body: profile, signal }),

  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),

  // --- Administration (profil ADMIN uniquement)
  admin: {
    listUsers: (params = {}) => request(`/admin/users${qs(params)}`),
    createUser: (payload) => request('/admin/users', { method: 'POST', body: payload }),
    updateUser: (id, payload) => request(`/admin/users/${id}`, { method: 'PUT', body: payload }),
    resetPassword: (id, password) =>
      request(`/admin/users/${id}/password`, { method: 'POST', body: { password } }),

    listBanks: () => request('/admin/banks'),
    createBank: (payload) => request('/admin/banks', { method: 'POST', body: payload }),
    updateBank: (id, payload) => request(`/admin/banks/${id}`, { method: 'PUT', body: payload }),

    listMcc: (params = {}) => request(`/admin/mcc${qs(params)}`),

    /** Téléverse un fichier Excel ou CSV : renvoie les lignes lues et le rapport d'écart. */
    lireFichierMcc: async (fichier) => {
      const corps = new FormData();
      corps.append('fichier', fichier);
      const res = await fetch('/api/admin/mcc/import-fichier', {
        method: 'POST',
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        body: corps, // pas de Content-Type : le navigateur pose la frontière multipart
      });
      const donnees = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError(donnees?.error ?? `Erreur ${res.status}`, {
          status: res.status,
          details: donnees?.details,
        });
      }
      return donnees;
    },

    /** Télécharge le référentiel courant. La requête est authentifiée, d'où le Blob. */
    exporterMcc: async (format = 'xlsx') => {
      const res = await fetch(`/api/admin/mcc/export?format=${format}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!res.ok) throw new ApiError(`Export impossible (erreur ${res.status})`, { status: res.status });
      const blob = await res.blob();
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = `referentiel-mcc-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(lien.href);
    },
    getMcc: (code) => request(`/admin/mcc/${code}`),
    mccHistory: (code) => request(`/admin/mcc/${code}/history`),
    createMcc: (payload) => request('/admin/mcc', { method: 'POST', body: payload }),
    updateMcc: (code, payload) => request(`/admin/mcc/${code}`, { method: 'PUT', body: payload }),
    importMcc: (payload) => request('/admin/mcc/import', { method: 'POST', body: payload }),

    events: (limit = 100) => request(`/admin/events?limit=${limit}`),
  },

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
