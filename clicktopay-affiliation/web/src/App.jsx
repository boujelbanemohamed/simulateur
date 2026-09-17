import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import RequestFormPage from './pages/RequestFormPage.jsx';
import RequestDetailPage from './pages/RequestDetailPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';

function Protege({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="vide">Chargement de la session…</p>;
  if (!user) return <Navigate to="/connexion" state={{ from: location }} replace />;
  return children;
}

function Entete() {
  const { user, logout, isAgent } = useAuth();
  const lien = ({ isActive }) => (isActive ? 'actif' : undefined);

  return (
    <header className="topbar">
      <div className="topbar__brand">
        ClickToPay <span>| Affiliation</span>
      </div>
      <nav>
        <NavLink to="/demandes" className={lien}>
          Demandes
        </NavLink>
        {isAgent && (
          <NavLink to="/demandes/nouvelle" className={lien}>
            Nouvelle demande
          </NavLink>
        )}
        <NavLink to="/referentiel" className={lien}>
          Référentiel MCC
        </NavLink>
      </nav>
      <div className="topbar__user">
        <strong>
          {user.firstName} {user.lastName}
        </strong>
        <span>
          {user.role === 'AGENT' ? 'Agent' : user.role === 'BANQUIER' ? 'Banquier' : 'Administrateur'} —{' '}
          {user.bankCode}
        </span>
      </div>
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
          <Route path="/demandes/nouvelle" element={<Protege><RequestFormPage /></Protege>} />
          <Route path="/demandes/:id" element={<Protege><RequestDetailPage /></Protege>} />
          <Route path="/demandes/:id/modifier" element={<Protege><RequestFormPage /></Protege>} />
          <Route path="/referentiel" element={<Protege><CatalogPage /></Protege>} />
          <Route path="*" element={<Navigate to="/demandes" replace />} />
        </Routes>
      </main>
    </div>
  );
}
