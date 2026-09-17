import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Champ, ErreurApi, Message } from '../components/ui.jsx';

/**
 * Changement de mot de passe. Sert aussi d'écran obligatoire après une
 * réinitialisation par un administrateur : tant qu'il n'est pas validé, le
 * serveur refuse toutes les autres routes.
 */
export default function PasswordPage() {
  const { changePassword, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const [champs, setChamps] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [erreur, setErreur] = useState(null);
  const [succes, setSucces] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const maj = (cle) => (e) => setChamps((c) => ({ ...c, [cle]: e.target.value }));
  const discordance = champs.confirmation.length > 0 && champs.confirmation !== champs.newPassword;

  const soumettre = async (event) => {
    event.preventDefault();
    if (discordance) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await changePassword(champs.currentPassword, champs.newPassword);
      setSucces(true);
      setTimeout(() => navigate('/demandes', { replace: true }), 1200);
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <div className="entete">
        <div>
          <h1>Mot de passe</h1>
          <p>Choisissez un mot de passe d'au moins 10 caractères, avec une minuscule, une majuscule et un chiffre.</p>
        </div>
      </div>

      {mustChangePassword && (
        <Message type="attention" titre="Changement obligatoire">
          Votre mot de passe a été réinitialisé par un administrateur. Vous devez en
          définir un nouveau avant d'accéder à la plateforme.
        </Message>
      )}
      {succes && <Message type="succes" titre="Mot de passe modifié">Redirection en cours…</Message>}
      <ErreurApi erreur={erreur} />

      <form className="carte" onSubmit={soumettre} style={{ maxWidth: 520 }}>
        <Champ label="Mot de passe actuel" name="currentPassword" type="password" requis
          autoComplete="current-password" value={champs.currentPassword} onChange={maj('currentPassword')} />
        <Champ label="Nouveau mot de passe" name="newPassword" type="password" requis
          autoComplete="new-password" value={champs.newPassword} onChange={maj('newPassword')} />
        <Champ label="Confirmation" name="confirmation" type="password" requis
          autoComplete="new-password" value={champs.confirmation} onChange={maj('confirmation')}
          erreur={discordance ? 'Les deux saisies ne correspondent pas' : undefined} />
        <div className="barre-actions">
          <button className="bouton" type="submit" disabled={envoi || discordance}>
            {envoi ? 'Enregistrement…' : 'Changer le mot de passe'}
          </button>
        </div>
      </form>
    </>
  );
}
