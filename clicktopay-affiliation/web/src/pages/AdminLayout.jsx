import { NavLink, Outlet } from 'react-router-dom';

const ONGLETS = [
  { to: 'comptes', libelle: 'Comptes' },
  { to: 'banques', libelle: 'Banques' },
  { to: 'referentiel', libelle: 'Référentiel MCC' },
  { to: 'import', libelle: 'Import du référentiel' },
  { to: 'journal', libelle: 'Journal' },
];

export default function AdminLayout() {
  return (
    <>
      <div className="sous-nav">
        {ONGLETS.map((o) => (
          <NavLink key={o.to} to={o.to} className={({ isActive }) => (isActive ? 'actif' : undefined)}>
            {o.libelle}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </>
  );
}
