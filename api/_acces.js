/* Accès, quota et permissions — logique partagée par les endpoints coûteux.
   Le préfixe « _ » empêche Vercel d'en faire une route publique.

   Règle métier : le quota vit sur l'organisation, jamais sur le profil,
   parce qu'un abonnement couvre toute l'équipe et que les places sont
   illimitées. Une ré-analyse d'un dossier déjà connu ne consomme rien. */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ORIGINE = 'https://getbidray.com';

function entetes(res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGINE);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

/* Identifie l'appelant et remonte jusqu'à son organisation.
   Retourne { erreur, code } en cas de refus, sinon { user, membre, org }. */
async function identifier(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return { erreur: 'Connexion requise', code: 401 };

  const { data: { user } = {}, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) return { erreur: 'Session expirée — reconnectez-vous.', code: 401 };

  const { data: membre } = await sb
    .from('membres')
    .select('org_id, role, p_analyser')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membre || !membre.org_id) {
    return { erreur: "Aucune organisation rattachée à ce compte.", code: 403 };
  }

  const { data: org } = await sb
    .from('organisations')
    .select('id, plan, analyses_used, analyses_limit')
    .eq('id', membre.org_id)
    .maybeSingle();

  if (!org) return { erreur: 'Organisation introuvable.', code: 403 };

  return { user, membre, org };
}

/* Ce dossier a-t-il déjà été traité par cette organisation ? */
async function dossierDejaVu(orgId, sig) {
  if (!sig) return false;
  const { data } = await sb
    .from('analyses')
    .select('id')
    .eq('org_id', orgId)
    .eq('dossier_sig', sig)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/* Contrôle du quota AVANT l'appel au modèle, donc avant toute dépense.
   Retourne { autorise, motif, code, nouveau }. */
async function verifierQuota(org, sig) {
  const limite = typeof org.analyses_limit === 'number' ? org.analyses_limit : 1;
  const consommees = org.analyses_used || 0;

  if (limite === -1) return { autorise: true, nouveau: !(await dossierDejaVu(org.id, sig)) };

  const nouveau = !(await dossierDejaVu(org.id, sig));
  if (!nouveau) return { autorise: true, nouveau: false };

  if (consommees >= limite) {
    return {
      autorise: false,
      code: 402,
      motif: "Limite d'analyses atteinte. Passez à l'abonnement pour continuer.",
    };
  }
  return { autorise: true, nouveau: true };
}

/* Consomme une unité, uniquement pour un dossier réellement nouveau.
   Appelé APRÈS le succès de l'appel au modèle. */
async function consommer(org, nouveau) {
  const limite = typeof org.analyses_limit === 'number' ? org.analyses_limit : 1;
  const consommees = org.analyses_used || 0;
  if (!nouveau) return { used: consommees, limit: limite };

  const suivant = consommees + 1;
  const { error } = await sb
    .from('organisations')
    .update({ analyses_used: suivant })
    .eq('id', org.id);

  if (error) {
    console.error('Incrément du quota impossible:', error.message);
    return { used: consommees, limit: limite };
  }
  return { used: suivant, limit: limite };
}

module.exports = { sb, ORIGINE, entetes, identifier, verifierQuota, consommer };
