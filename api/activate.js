const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* Offre unique : un paiement confirmé donne l'accès complet,
   que l'abonnement soit mensuel ou annuel. */
const ACCES_PAYANT = { plan: 'pro', analyses_limit: -1 };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id, user_id } = req.body;
  if (!session_id || !user_id) {
    return res.status(400).json({ error: 'session_id et user_id requis' });
  }

  try {
    // Vérifie le paiement auprès de Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription']
    });

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Paiement non confirmé' });
    }

    const abonnement = session.subscription || null;
    const abonnementId = typeof abonnement === 'string' ? abonnement : (abonnement?.id || null);

    // Met à jour le profil dans Supabase
    const { error } = await sb.from('profiles').update({
      plan: ACCES_PAYANT.plan,
      analyses_limit: ACCES_PAYANT.analyses_limit,
      analyses_used: 0,
      stripe_customer_id: session.customer,
      stripe_subscription_id: abonnementId,
      updated_at: new Date().toISOString()
    }).eq('id', user_id);

    if (error) {
      console.error('Supabase update error:', error);
      return res.status(500).json({ error: 'Erreur mise à jour profil' });
    }

    return res.status(200).json({
      success: true,
      plan: ACCES_PAYANT.plan,
      analyses_limit: ACCES_PAYANT.analyses_limit
    });

  } catch (err) {
    console.error('Activation error:', err);
    return res.status(500).json({ error: err.message });
  }
};
