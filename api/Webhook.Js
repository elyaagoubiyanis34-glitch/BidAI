import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PLAN_LIMITS = {
  'price_1TD7iZHC1Gx8dtyGRwnwVoju': { plan: 'starter', analyses_limit: 20 },
  'price_1TD7j7HC1Gx8dtyGJJCkwMN2': { plan: 'pro', analyses_limit: -1 },
  'price_BUSINESS_ID':{ plan: 'business',analyses_limit: -1 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const session = event.data.object;

  switch (event.type) {

    case 'checkout.session.completed': {
      const customerId = session.customer;
      const customerEmail = session.customer_details?.email || session.customer_email;
      const subscriptionId = session.subscription;

      // Get subscription details to find the price
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price?.id;
      const planInfo = PLAN_LIMITS[priceId] || { plan: 'starter', analyses_limit: 20 };

      // Find user by email in Supabase
      const { data: users } = await sb.auth.admin.listUsers();
      const user = users?.users?.find(u => u.email === customerEmail);

      if (user) {
        await sb.from('profiles').upsert({
          id: user.id,
          plan: planInfo.plan,
          analyses_limit: planInfo.analyses_limit,
          analyses_used: 0,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          updated_at: new Date().toISOString()
        });
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      // Reset monthly usage counter on renewal
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      const customerId = session.customer;

      const { data: profile } = await sb.from('profiles').select('id').eq('stripe_customer_id', customerId).single();
      if (profile) {
        await sb.from('profiles').update({
          analyses_used: 0,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = session.customer;
      const { data: profile } = await sb.from('profiles').select('id').eq('stripe_customer_id', customerId).single();
      if (profile) {
        await sb.from('profiles').update({
          plan: 'free',
          analyses_limit: 3,
          analyses_used: 0,
          stripe_subscription_id: null,
          updated_at: new Date().toISOString()
        }).eq('id', profile.id);
      }
      break;
    }
  }

  return res.status(200).json({ received: true });
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export const config = { api: { bodyParser: false } };
