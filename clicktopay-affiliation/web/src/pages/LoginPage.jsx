import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Champ, ErreurApi } from '../components/ui.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const soumettre = async (event) => {
    event.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await login(email, password);
      navigate('/demandes', { replace: true });
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="connexion">
      <form className="connexion__carte" onSubmit={soumettre}>
        <h1 className="connexion__titre">ClickToPay</h1>
        <p className="connexion__sous-titre">
          Plateforme d'affiliation des e-commerçants
        </p>

        <ErreurApi erreur={erreur} />

        <Champ
          label="Adresse e-mail"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Champ
          label="Mot de passe"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="bouton" type="submit" disabled={envoi}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>

        <div className="connexion__aide">
          Comptes de démonstration : <code>agent@banque.tn</code> / <code>Agent#2026</code> —{' '}
          <code>banquier@banque.tn</code> / <code>Banquier#2026</code>
        </div>
      </form>
    </div>
  );
}
