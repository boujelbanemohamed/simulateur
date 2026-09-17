import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  // Un jeton présent au chargement est revalidé côté serveur avant d'afficher l'application.
  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('clicktopay:unauthorized', onUnauthorized);
    return () => window.removeEventListener('clicktopay:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: profile } = await api.login(email, password);
    setToken(token);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  /**
   * Changement de mot de passe. Le serveur renvoie un jeton neuf, sans
   * l'obligation de changement : il remplace celui en mémoire.
   */
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { token } = await api.changePassword(currentPassword, newPassword);
    setToken(token);
    setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      changePassword,
      isAgent: user?.role === 'AGENT' || user?.role === 'ADMIN',
      isBanquier: user?.role === 'BANQUIER' || user?.role === 'ADMIN',
      isAdmin: user?.role === 'ADMIN',
      mustChangePassword: Boolean(user?.mustChangePassword),
    }),
    [user, loading, login, logout, changePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return context;
};
