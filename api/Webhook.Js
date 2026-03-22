const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLAN_LIMITS = {
  'price_1TDWSoHG45lr2heeQ5lOjBHe': { plan: 'starter', analyses_limit: 5 },
  'price_1TDWTBHG45lr2heeoDjlc32M': { plan: 'pro',     analyses_limit: -1 },
};

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

  try {

    // ── Changement ou upgrade de plan ──
    if (event.type === 'customer.subscription.updated') {
      const customerId = obj.customer;
      const priceId = obj.items?.data[0]?.price?.id;
      const planInfo = PLAN_LIMITS[priceId];

      if (!planInfo) {
        console.log('Prix non reconnu:', priceId);
        return res.status(200).json({ received: true });
      }

      const { data: profile } = await sb.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
      if (profile) {
        await sb.from('profiles').update({
          plan: planInfo.plan,
          analyses_limit: planInfo.analyses_limit,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
        console.log('Plan mis à jour:', planInfo.plan, 'pour customer:', customerId);
      }
    }

    // ── Résiliation ──
    if (event.type === 'customer.subscription.deleted') {
      const customerId = obj.customer;
      const { data: profile } = await sb.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
      if (profile) {
        await sb.from('profiles').update({
          plan: 'free',
          analyses_limit: 1,
          analyses_used: 0,
          stripe_subscription_id: null,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
        console.log('Plan résilié, retour free pour customer:', customerId);
      }
    }

    // ── Reset mensuel à chaque renouvellement ──
    if (event.type === 'invoice.payment_succeeded') {
      const customerId = obj.customer;
      const { data: profile } = await sb.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
      if (profile) {
        await sb.from('profiles').update({
          analyses_used: 0,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
        console.log('Compteur remis à 0 pour customer:', customerId);
      }
    }

  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
