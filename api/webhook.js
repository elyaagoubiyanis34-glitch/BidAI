const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* Offre unique : tout abonnement actif donne le même accès.
   Aucun identifiant de prix n'est codé ici, donc créer ou modifier
   un tarif dans Stripe ne casse rien. */
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
     Sert uniquement au premier paiement, quand le lien entre le
     client Stripe et le profil n'existe pas encore. */
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

  try {

    // ── Paiement confirmé : c'est ici que l'accès s'ouvre ──
    if (event.type === 'checkout.session.completed') {
      if (obj.payment_status !== 'paid') {
        console.log('Session terminée mais non payée, ignorée');
        return res.status(200).json({ received: true });
      }

      const email = obj.customer_details && obj.customer_details.email;
      let profile = await profilParClient(obj.customer);
      if (!profile) profile = await profilParEmail(email);

      if (profile) {
        await sb.from('profiles').update({
          plan: ACCES_PAYANT.plan,
          analyses_limit: ACCES_PAYANT.analyses_limit,
          analyses_used: 0,
          stripe_customer_id: obj.customer,
          stripe_subscription_id: obj.subscription || null,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
        console.log('Acces ouvert pour', email, '-> profil', profile.id);
      } else {
        // Le client a payé sans compte BidRay au même email.
        console.error('PAIEMENT SANS PROFIL - a rattacher a la main :', email, obj.customer);
      }
    }

    // ── Changement d'état de l'abonnement ──
    // Résiliation programmée, impayé, reprise après échec.
    if (event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated') {

      const profile = await profilParClient(obj.customer);
      if (profile) {
        const actif = STATUTS_ACTIFS.includes(obj.status);
        const acces = actif ? ACCES_PAYANT : ACCES_LIBRE;

        await sb.from('profiles').update({
          plan: acces.plan,
          analyses_limit: acces.analyses_limit,
          stripe_subscription_id: actif ? obj.id : null,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);

        console.log('Abonnement', obj.status, '-> plan', acces.plan);
      }
    }

    // ── Résiliation effective ──
    if (event.type === 'customer.subscription.deleted') {
      const profile = await profilParClient(obj.customer);
      if (profile) {
        await sb.from('profiles').update({
          plan: ACCES_LIBRE.plan,
          analyses_limit: ACCES_LIBRE.analyses_limit,
          analyses_used: 0,
          stripe_subscription_id: null,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
        console.log('Resiliation, retour free pour', obj.customer);
      }
    }

    // ── Renouvellement payé : compteur remis à zéro ──
    if (event.type === 'invoice.payment_succeeded') {
      const profile = await profilParClient(obj.customer);
      if (profile) {
        await sb.from('profiles').update({
          analyses_used: 0,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
        console.log('Compteur remis a 0 pour', obj.customer);
      }
    }

  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
