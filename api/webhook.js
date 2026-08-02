const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* Offre unique : tout abonnement actif donne le même accès.
   Aucun identifiant de prix n'est codé ici, donc créer ou modifier
   un tarif dans Stripe ne casse rien.

   IMPORTANT : le quota est lu par l'application sur la table
   « organisations ». Le plan doit donc y être écrit, pas seulement
   sur « profiles ». Le profil ne sert qu'à retrouver l'organisation
   et à conserver le lien avec le client Stripe. */
const ACCES_PAYANT = { plan: 'pro', analyses_limit: -1 };
const ACCES_LIBRE  = { plan: 'free', analyses_limit: 1 };

const STATUTS_ACTIFS = ['active', 'trialing', 'past_due'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Signature manquante' });

  let event;
  let rawBody = '';

  await new Promise((resolve, reject) => {
    req.on('data', chunk => rawBody += chunk);
    req.on('end', resolve);
    req.on('error', reject);
  });

  try {
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: 'Signature invalide' });
  }

  const obj = event.data.object;
  console.log('Webhook event:', event.type);

  /* Retrouve un profil à partir de l'identifiant client Stripe. */
  async function profilParClient(customerId) {
    if (!customerId) return null;
    const { data } = await sb
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    return data || null;
  }

  /* Retrouve un compte à partir de l'email saisi au paiement.
     Sert au premier paiement, quand le lien client Stripe / profil
     n'existe pas encore. */
  async function profilParEmail(email) {
    if (!email) return null;
    try {
      const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) { console.error('listUsers error:', error.message); return null; }
      const cible = email.trim().toLowerCase();
      const user = (data.users || []).find(u => (u.email || '').toLowerCase() === cible);
      return user ? { id: user.id } : null;
    } catch (err) {
      console.error('Recherche par email impossible:', err.message);
      return null;
    }
  }

  /* Remonte du compte utilisateur vers son organisation. */
  async function orgDe(userId) {
    const { data } = await sb
      .from('membres')
      .select('org_id')
      .eq('user_id', userId)
      .maybeSingle();
    return data && data.org_id ? data.org_id : null;
  }

  /* Applique un niveau d'accès : organisation d'abord, profil ensuite. */
  async function appliquer(profileId, acces, extras) {
    const orgId = await orgDe(profileId);

    if (orgId) {
      const majOrg = { plan: acces.plan, analyses_limit: acces.analyses_limit };
      if (acces.reset) majOrg.analyses_used = 0;
      const { error } = await sb.from('organisations').update(majOrg).eq('id', orgId);
      if (error) console.error('MAJ organisation impossible:', error.message);
      else console.log('Organisation', orgId, '->', acces.plan, acces.analyses_limit);
    } else {
      console.error('AUCUNE ORGANISATION pour le profil', profileId, '- a rattacher a la main');
    }

    const majProfil = Object.assign({
      plan: acces.plan,
      analyses_limit: acces.analyses_limit,
      updated_at: new Date().toISOString()
    }, extras || {});
    if (acces.reset) majProfil.analyses_used = 0;

    const { error } = await sb.from('profiles').update(majProfil).eq('id', profileId);
    if (error) console.error('MAJ profil impossible:', error.message);
  }

  try {

    // ── Paiement confirmé : c'est ici que l'accès s'ouvre ──
    if (event.type === 'checkout.session.completed') {
      if (obj.payment_status !== 'paid') {
        console.log('Session terminee mais non payee, ignoree');
        return res.status(200).json({ received: true });
      }

      const email = obj.customer_details && obj.customer_details.email;
      let profile = await profilParClient(obj.customer);
      if (!profile) profile = await profilParEmail(email);

      if (profile) {
        await appliquer(profile.id, Object.assign({ reset: true }, ACCES_PAYANT), {
          stripe_customer_id: obj.customer,
          stripe_subscription_id: obj.subscription || null
        });
        console.log('Acces ouvert pour', email);
      } else {
        console.error('PAIEMENT SANS PROFIL - a rattacher a la main :', email, obj.customer);
      }
    }

    // ── Changement d'état : résiliation programmée, impayé, reprise ──
    if (event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated') {

      const profile = await profilParClient(obj.customer);
      if (profile) {
        const actif = STATUTS_ACTIFS.includes(obj.status);
        const acces = actif ? ACCES_PAYANT : ACCES_LIBRE;
        await appliquer(profile.id, acces, {
          stripe_subscription_id: actif ? obj.id : null
        });
        console.log('Abonnement', obj.status, '->', acces.plan);
      }
    }

    // ── Résiliation effective ──
    if (event.type === 'customer.subscription.deleted') {
      const profile = await profilParClient(obj.customer);
      if (profile) {
        await appliquer(profile.id, Object.assign({ reset: true }, ACCES_LIBRE), {
          stripe_subscription_id: null
        });
        console.log('Resiliation, retour free');
      }
    }

    // ── Renouvellement payé : compteur remis à zéro ──
    if (event.type === 'invoice.payment_succeeded') {
      const profile = await profilParClient(obj.customer);
      if (profile) {
        const orgId = await orgDe(profile.id);
        if (orgId) await sb.from('organisations').update({ analyses_used: 0 }).eq('id', orgId);
        await sb.from('profiles')
          .update({ analyses_used: 0, updated_at: new Date().toISOString() })
          .eq('id', profile.id);
        console.log('Compteur remis a 0');
      }
    }

  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
