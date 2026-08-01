const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* Offre unique : tout abonnement actif donne le même accès.
   Aucun identifiant de prix n'est codé ici, donc créer un nouveau
   tarif dans Stripe ne casse plus rien. */
const ACCES_PAYANT = { plan: 'pro', analyses_limit: -1 };
const ACCES_LIBRE   = { plan: 'free', analyses_limit: 1 };

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

  async function profilDe(customerId) {
    if (!customerId) return null;
    const { data } = await sb
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    return data || null;
  }

  try {

    // ── Abonnement créé ou modifié ──
    // Mensuel ou annuel, peu importe : c'est la même offre.
    if (event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated') {

      const profile = await profilDe(obj.customer);
      if (profile) {
        const actif = STATUTS_ACTIFS.includes(obj.status);
        const acces = actif ? ACCES_PAYANT : ACCES_LIBRE;

        await sb.from('profiles').update({
          plan: acces.plan,
          analyses_limit: acces.analyses_limit,
          stripe_subscription_id: actif ? obj.id : null,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);

        console.log('Abonnement', obj.status, '→ plan', acces.plan, 'pour', obj.customer);
      } else {
        console.log('Aucun profil lié au customer', obj.customer);
      }
    }

    // ── Résiliation ──
    if (event.type === 'customer.subscription.deleted') {
      const profile = await profilDe(obj.customer);
      if (profile) {
        await sb.from('profiles').update({
          plan: ACCES_LIBRE.plan,
          analyses_limit: ACCES_LIBRE.analyses_limit,
          analyses_used: 0,
          stripe_subscription_id: null,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
        console.log('Résiliation, retour free pour', obj.customer);
      }
    }

    // ── Renouvellement payé : on remet le compteur à zéro ──
    if (event.type === 'invoice.payment_succeeded') {
      const profile = await profilDe(obj.customer);
      if (profile) {
        await sb.from('profiles').update({
          analyses_used: 0,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
        console.log('Compteur remis à 0 pour', obj.customer);
      }
    }

  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
