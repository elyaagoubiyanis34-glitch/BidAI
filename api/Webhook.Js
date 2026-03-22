const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PLAN_LIMITS = {
  'price_1TDWSoHG45lr2heeQ5lOjBHe': { plan: 'starter', analyses_limit: 5 },
  'price_1TDWTBHG45lr2heeoDjlc32M':     { plan: 'pro',     analyses_limit: -1 },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const session = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const customerId = session.customer;
    const customerEmail = session.customer_details?.email;
    const subscriptionId = session.subscription;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0]?.price?.id;
    const planInfo = PLAN_LIMITS[priceId] || { plan: 'starter', analyses_limit: 5 };

    const { data: users } = await sb.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email === customerEmail);

    if (user) {
      await sb.from('profiles').update({
        plan: planInfo.plan,
        analyses_limit: planInfo.analyses_limit,
        analyses_used: 0,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        updated_at: new Date().toISOString()
      }).eq('id', user.id);
    }
  }

  if (event.type === 'invoice.payment_succeeded') {
    const customerId = session.customer;
    const { data: profile } = await sb.from('profiles').select('id').eq('stripe_customer_id', customerId).single();
    if (profile) {
      await sb.from('profiles').update({ analyses_used: 0, updated_at: new Date().toISOString() }).eq('id', profile.id);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const customerId = session.customer;
    const { data: profile } = await sb.from('profiles').select('id').eq('stripe_customer_id', customerId).single();
    if (profile) {
      await sb.from('profiles').update({ plan: 'free', analyses_limit: 3, analyses_used: 0, stripe_subscription_id: null, updated_at: new Date().toISOString() }).eq('id', profile.id);
    }
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
