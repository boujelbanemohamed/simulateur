import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// `administrateurSeul` : le référentiel MCC est commun à toutes les banques, donc
// hors du périmètre d'un banquier, qui n'administre que la sienne.
const ONGLETS = [
  { to: 'comptes', libelle: 'Comptes' },
  { to: 'banques', libelle: 'Banques' },
  { to: 'referentiel', libelle: 'Référentiel MCC', administrateurSeul: true },
  { to: 'import', libelle: 'Import du référentiel', administrateurSeul: true },
  { to: 'journal', libelle: 'Journal' },
];

export default function AdminLayout() {
  const { isAdmin } = useAuth();
  const onglets = ONGLETS.filter((o) => !o.administrateurSeul || isAdmin);
  return (
    <>
      <div className="sous-nav">
        {onglets.map((o) => (
          <NavLink key={o.to} to={o.to} className={({ isActive }) => (isActive ? 'actif' : undefined)}>
            {o.libelle}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </>
  );
}
