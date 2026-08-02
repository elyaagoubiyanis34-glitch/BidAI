const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ROLES = ['admin', 'contributeur', 'lecteur'];
const PERMS = ['p_analyser', 'p_modifier', 'p_supprimer', 'p_attestations', 'p_membres', 'p_facturation'];
const COLS  = 'user_id, role, personnalise, ' + PERMS.join(', ') + ', created_at';

async function journal(org_id, user_id, action, cible, details = {}) {
  try { await sb.from('activite').insert({ org_id, user_id, action, cible, details }); }
  catch (e) { /* le journal ne bloque jamais l'action */ }
}

async function emailDe(user_id) {
  try { const { data } = await sb.auth.admin.getUserById(user_id); return data?.user?.email || '—'; }
  catch (e) { return '—'; }
}

// Vérifie qu'au moins un membre conservera la permission donnée
async function resteAuMoinsUn(org_id, perm, exclu_user_id, futureValeur) {
  const { data } = await sb.from('membres').select('user_id, ' + perm).eq('org_id', org_id);
  return (data || []).some(m =>
    m.user_id === exclu_user_id ? futureValeur : m[perm] === true
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://getbidray.com');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise' });
  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Session expirée — reconnectez-vous.' });

  const { data: moi } = await sb.from('membres')
    .select('org_id, role, ' + PERMS.join(', ')).eq('user_id', user.id).maybeSingle();
  if (!moi) return res.status(403).json({ error: 'Aucune organisation rattachée à ce compte.' });

  const org_id = moi.org_id;
  const gereEquipe = moi.p_membres === true;

  try {
    // ═══ LISTER ═══
    if (req.method === 'GET') {
      const { data: membres } = await sb.from('membres')
        .select(COLS).eq('org_id', org_id).order('created_at', { ascending: true });

      const enrichis = [];
      for (const m of membres || []) {
        enrichis.push({
          user_id: m.user_id,
          email: await emailDe(m.user_id),
          role: m.role,
          personnalise: m.personnalise,
          permissions: Object.fromEntries(PERMS.map(p => [p.slice(2), m[p]])),
          moi: m.user_id === user.id,
          depuis: m.created_at
        });
      }

      const { data: invits } = await sb.from('invitations')
        .select('id, email, role, created_at, expires_at')
        .eq('org_id', org_id).is('accepted_at', null)
        .gt('expires_at', new Date().toISOString());

      return res.status(200).json({
        membres: enrichis,
        invitations: invits || [],
        mes_permissions: Object.fromEntries(PERMS.map(p => [p.slice(2), moi[p]])),
        mon_role: moi.role
      });
    }

    // Les opérations suivantes exigent la permission « membres »
    if (!gereEquipe) {
      return res.status(403).json({ error: "Vous n'avez pas la permission de gérer l'équipe." });
    }

    // ═══ INVITER ═══
    if (req.method === 'POST') {
      const email = (req.body.email || '').trim().toLowerCase();
      const role = ROLES.includes(req.body.role) ? req.body.role : 'contributeur';

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ error: 'Adresse email invalide.' });
      }

      const { data: equipe } = await sb.from('membres').select('user_id').eq('org_id', org_id);
      for (const m of equipe || []) {
        if ((await emailDe(m.user_id)).toLowerCase() === email) {
          return res.status(409).json({ error: 'Cette personne fait déjà partie de votre équipe.' });
        }
      }

      const { data: enAttente } = await sb.from('invitations')
        .select('id').eq('org_id', org_id).ilike('email', email)
        .is('accepted_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (enAttente) return res.status(409).json({ error: 'Une invitation est déjà en attente pour cette adresse.' });

      const { data: invit, error } = await sb.from('invitations')
        .insert({ org_id, email, role, invited_by: user.id })
        .select('id, email, role, expires_at').single();
      if (error) return res.status(500).json({ error: error.message });

      await journal(org_id, user.id, 'membre.invite', email, { role });
      return res.status(200).json({
        invitation: invit,
        message: `Invitation créée. ${email} rejoindra l'équipe en créant son compte avec cette adresse.`
      });
    }

    // ═══ MODIFIER : rôle et/ou permissions ═══
    if (req.method === 'PATCH') {
      const { user_id, role, permissions } = req.body;
      if (!user_id) return res.status(400).json({ error: 'Membre non précisé.' });
      if (user_id === user.id) {
        return res.status(400).json({ error: 'Vous ne pouvez pas modifier vos propres droits.' });
      }

      const { data: cible } = await sb.from('membres')
        .select(COLS).eq('org_id', org_id).eq('user_id', user_id).maybeSingle();
      if (!cible) return res.status(404).json({ error: 'Membre introuvable.' });

      const maj = {};

      // Changement de rôle : réinitialise sur le modèle (géré par le trigger SQL)
      if (role) {
        if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rôle inconnu.' });
        maj.role = role;
      }

      // Permissions individuelles : bascule le membre en « personnalisé »
      if (permissions && typeof permissions === 'object') {
        for (const [nom, val] of Object.entries(permissions)) {
          const col = 'p_' + nom;
          if (!PERMS.includes(col)) continue;
          maj[col] = val === true;
        }
        if (Object.keys(maj).some(k => k.startsWith('p_'))) maj.personnalise = true;
      }

      if (!Object.keys(maj).length) return res.status(400).json({ error: 'Aucune modification demandée.' });

      // Garde-fous : l'organisation doit conserver quelqu'un pour gérer
      // l'équipe et la facturation.
      for (const [col, libelle] of [['p_membres', "gérer l'équipe"], ['p_facturation', "gérer l'abonnement"]]) {
        let future;
        if (col in maj) future = maj[col];
        else if (maj.role) future = maj.role === 'admin';
        else continue;
        if (future === false && !(await resteAuMoinsUn(org_id, col, user_id, false))) {
          return res.status(400).json({ error: `Au moins une personne doit pouvoir ${libelle}.` });
        }
      }

      const { error } = await sb.from('membres')
        .update(maj).eq('org_id', org_id).eq('user_id', user_id);
      if (error) return res.status(500).json({ error: error.message });

      const { data: apres } = await sb.from('membres')
        .select(COLS).eq('org_id', org_id).eq('user_id', user_id).maybeSingle();

      await journal(org_id, user.id,
        maj.role ? 'membre.role' : 'membre.permissions',
        await emailDe(user_id),
        maj.role ? { role: maj.role } : { permissions: maj });

      return res.status(200).json({
        membre: {
          user_id,
          role: apres.role,
          personnalise: apres.personnalise,
          permissions: Object.fromEntries(PERMS.map(p => [p.slice(2), apres[p]]))
        }
      });
    }

    // ═══ RETIRER ═══
    if (req.method === 'DELETE') {
      const { user_id, invitation_id } = req.body;

      if (invitation_id) {
        await sb.from('invitations').delete().eq('id', invitation_id).eq('org_id', org_id);
        await journal(org_id, user.id, 'invitation.annulee', invitation_id);
        return res.status(200).json({ ok: true });
      }

      if (user_id === user.id) return res.status(400).json({ error: 'Vous ne pouvez pas vous retirer vous-même.' });

      for (const [col, libelle] of [['p_membres', "gérer l'équipe"], ['p_facturation', "gérer l'abonnement"]]) {
        if (!(await resteAuMoinsUn(org_id, col, user_id, false))) {
          return res.status(400).json({ error: `Au moins une personne doit pouvoir ${libelle}.` });
        }
      }

      const mail = await emailDe(user_id);
      const { error } = await sb.from('membres')
        .delete().eq('org_id', org_id).eq('user_id', user_id);
      if (error) return res.status(500).json({ error: error.message });

      await journal(org_id, user.id, 'membre.retire', mail);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
