import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import RequestFormPage from './pages/RequestFormPage.jsx';
import RequestDetailPage from './pages/RequestDetailPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import PasswordPage from './pages/PasswordPage.jsx';
import AdminLayout from './pages/AdminLayout.jsx';
import AdminUsersPage from './pages/AdminUsersPage.jsx';
import AdminBanksPage from './pages/AdminBanksPage.jsx';
import AdminMccPage from './pages/AdminMccPage.jsx';
import AdminMccImportPage from './pages/AdminMccImportPage.jsx';
import AdminEventsPage from './pages/AdminEventsPage.jsx';

function Protege({ children, adminSeul = false, agentSeul = false }) {
  const { user, loading, isAdmin, isAgent, mustChangePassword } = useAuth();
  const location = useLocation();
  if (loading) return <p className="vide">Chargement de la session…</p>;
  if (!user) return <Navigate to="/connexion" state={{ from: location }} replace />;
  // Un mot de passe réinitialisé doit être changé avant tout autre écran :
  // le serveur refuse de toute façon les autres routes.
  if (mustChangePassword && location.pathname !== '/mot-de-passe') {
    return <Navigate to="/mot-de-passe" replace />;
  }
  if (adminSeul && !isAdmin) return <Navigate to="/demandes" replace />;
  // Sans ce filtre, un banquier atteignait le formulaire de saisie par l'URL et
  // ne découvrait le refus qu'au moment d'enregistrer.
  if (agentSeul && !isAgent) return <Navigate to="/demandes" replace />;
  return children;
}

function Entete() {
  const { user, logout, isAgent, isAdmin, mustChangePassword } = useAuth();
  const lien = ({ isActive }) => (isActive ? 'actif' : undefined);

  return (
    <header className="topbar">
      <div className="topbar__brand">
        ClickToPay <span>| Affiliation</span>
      </div>
      {/* Pendant un changement de mot de passe imposé, la navigation est retirée :
          chaque lien ramenait silencieusement au même écran. */}
      <nav>
        {mustChangePassword && (
          <span className="topbar__contrainte">Changement de mot de passe requis</span>
        )}
        {!mustChangePassword && (
          <NavLink to="/demandes" className={lien}>
            Demandes
          </NavLink>
        )}
        {!mustChangePassword && isAgent && (
          <NavLink to="/demandes/nouvelle" className={lien}>
            Nouvelle demande
          </NavLink>
        )}
        {!mustChangePassword && (
          <NavLink to="/referentiel" className={lien}>
            Référentiel MCC
          </NavLink>
        )}
        {!mustChangePassword && isAdmin && (
          <NavLink to="/administration" className={lien}>
            Administration
          </NavLink>
        )}
      </nav>
      <NavLink to="/mot-de-passe" className="topbar__user" style={{ textDecoration: 'none' }}>
        <strong>
          {user.firstName} {user.lastName}
        </strong>
        <span>
          {user.role === 'AGENT' ? 'Agent' : user.role === 'BANQUIER' ? 'Banquier' : 'Administrateur'} —{' '}
          {user.bankCode}
        </span>
      </NavLink>
      <button type="button" className="bouton bouton--secondaire bouton--petit" onClick={logout}>
        Déconnexion
      </button>
    </header>
  );
}

export default function App() {
  const { user } = useAuth();

  return (
    <div className="app">
      {user && <Entete />}
      <main className="contenu">
        <Routes>
          <Route path="/connexion" element={user ? <Navigate to="/demandes" replace /> : <LoginPage />} />
          <Route path="/demandes" element={<Protege><DashboardPage /></Protege>} />
          <Route path="/demandes/nouvelle" element={<Protege agentSeul><RequestFormPage /></Protege>} />
          <Route path="/demandes/:id" element={<Protege><RequestDetailPage /></Protege>} />
          <Route path="/demandes/:id/modifier" element={<Protege agentSeul><RequestFormPage /></Protege>} />
          <Route path="/referentiel" element={<Protege><CatalogPage /></Protege>} />
          <Route path="/mot-de-passe" element={<Protege><PasswordPage /></Protege>} />
          <Route path="/administration" element={<Protege adminSeul><AdminLayout /></Protege>}>
            <Route index element={<Navigate to="comptes" replace />} />
            <Route path="comptes" element={<AdminUsersPage />} />
            <Route path="banques" element={<AdminBanksPage />} />
            <Route path="referentiel" element={<AdminMccPage />} />
            <Route path="import" element={<AdminMccImportPage />} />
            <Route path="journal" element={<AdminEventsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/demandes" replace />} />
        </Routes>
      </main>
    </div>
  );
}
