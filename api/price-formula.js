const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ipCache = new Map();
function isRateLimited(ip) {
  const now = Date.now(), windowMs = 3600000, max = 20;
  if (!ipCache.has(ip)) { ipCache.set(ip, { count: 1, start: now }); return false; }
  const d = ipCache.get(ip);
  if (now - d.start > windowMs) { ipCache.set(ip, { count: 1, start: now }); return false; }
  if (d.count >= max) return true;
  d.count++; return false;
}

// Détection de la formule prix à partir du texte du RC
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Trop de requêtes' });

  // Authentification requise
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise' });
  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Session expirée — reconnectez-vous.' });


  const { rc } = req.body;
  if (!rc) return res.status(400).json({ error: 'RC manquant' });

  const prompt = `Tu es un expert des marchés publics français. Analyse ce règlement de consultation et extrais UNIQUEMENT la méthode de notation du critère PRIX.

RC :
${rc.slice(0, 8000)}

Réponds UNIQUEMENT avec ce JSON (sans backticks) :
{
  "formule_detectee": true,
  "type_formule": "lineaire | inverse_proportionnelle | inconnue",
  "note_max_prix": 20,
  "ponderation_prix": "40%",
  "description": "explication en une phrase de la formule trouvée ou, si non trouvée, de la formule standard supposée",
  "formule_texte": "la formule exacte, ex: note = (offre la moins-disante / offre du candidat) × 20"
}

RÈGLES :
- type "inverse_proportionnelle" = note = (prix mini / prix candidat) × note_max  (la plus fréquente)
- type "lineaire" = note = note_max × (1 - (prix candidat - prix mini)/(prix max - prix mini)) ou une variante avec un écart de référence
- Si aucune formule n'est explicitement écrite dans le RC, mets formule_detectee=false, type_formule="inverse_proportionnelle" (hypothèse standard), et explique-le dans description.
- N'invente jamais une pondération : si absente, mets ponderation_prix="Non précisée".`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) return res.status(500).json({ error: 'Erreur API' });
    const data = await response.json();
    const raw = (data.content || []).map(b => b.text || '').join('');
    let parsed = null;
    for (const fn of [
      () => JSON.parse(raw.trim()),
      () => { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
      () => { const c = raw.replace(/```json/gi, '').replace(/```/g, '').trim(); const m = c.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
    ]) { try { parsed = fn(); if (parsed) break; } catch (e) {} }
    if (!parsed) return res.status(500).json({ error: 'Format inattendu' });
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
