import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [erreurSession, setErreurSession] = useState(null);

  // Un jeton présent au chargement est revalidé côté serveur avant d'afficher
  // l'application. Seul un refus explicite du serveur invalide le jeton : une
  // coupure réseau ou une erreur 5xx passagère ne doit pas coûter la session
  // (ni le brouillon en cours de saisie).
  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((profil) => {
        setUser(profil);
        setErreurSession(null);
      })
      .catch((err) => {
        if (err.status === 401 || err.status === 403) {
          clearToken();
        } else {
          setErreurSession(
            'Session non vérifiée : le serveur est injoignable. Vos identifiants sont conservés.'
          );
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    // Dès qu'une requête aboutit, le serveur est joignable : l'avertissement
    // posé pendant la coupure n'a plus lieu d'être. Le remettre à zéro ici plutôt
    // qu'à la seule connexion couvre aussi la reprise en cours de session.
    const onJoignable = () => setErreurSession((actuelle) => (actuelle ? null : actuelle));
    window.addEventListener('clicktopay:unauthorized', onUnauthorized);
    window.addEventListener('clicktopay:serveur-joignable', onJoignable);
    return () => {
      window.removeEventListener('clicktopay:unauthorized', onUnauthorized);
      window.removeEventListener('clicktopay:serveur-joignable', onJoignable);
    };
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
      erreurSession,
      isAgent: user?.role === 'AGENT' || user?.role === 'ADMIN',
      isBanquier: user?.role === 'BANQUIER' || user?.role === 'ADMIN',
      isAdmin: user?.role === 'ADMIN',
      // Depuis la décision D-3, le banquier administre sa banque et y saisit des
      // dossiers. Ces deux droits ne se déduisent plus d'un rôle unique : on les
      // nomme pour ce qu'ils permettent, et non pour qui les détient.
      peutSaisir: Boolean(user),
      peutAdministrer: user?.role === 'BANQUIER' || user?.role === 'ADMIN',
      mustChangePassword: Boolean(user?.mustChangePassword),
    }),
    [user, loading, login, logout, changePassword, erreurSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return context;
};
