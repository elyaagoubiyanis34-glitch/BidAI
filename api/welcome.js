module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  const prenom = name ? name.split(' ')[0] : 'là';

  const emailBody = `
Bonjour ${prenom},

Bienvenue sur BidAI ! Votre compte est maintenant actif.

Vous disposez d'1 analyse gratuite pour découvrir la puissance de l'outil.

👉 Accéder à mon dashboard : https://bid-ai-sand.vercel.app/app/dashboard.html

Comment ça marche :
1. Collez le texte de votre appel d'offres
2. Renseignez votre profil entreprise
3. Recevez votre score, les risques identifiés et un brouillon de réponse en 30 secondes

Des questions ? Répondez directement à cet email.

À très vite,
L'équipe BidAI
contact@bidai.fr
  `.trim();

  try {
    const res2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ok' }]
      })
    });

    // Utilise Supabase pour envoyer l'email
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: 'https://bid-ai-sand.vercel.app/app/dashboard.html' }
    });

    // Envoie l'email via Supabase
    await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        to: email,
        subject: 'Bienvenue sur BidAI — votre accès est prêt',
        text: emailBody
      })
    });

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Welcome email error:', e.message);
    return res.status(200).json({ success: true }); // Ne bloque pas l'inscription
  }
};
