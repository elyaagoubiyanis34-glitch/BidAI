const { entetes, identifier } = require('./_acces');

// Détection de la formule prix à partir du texte du RC
module.exports = async function handler(req, res) {
  entetes(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Identité + organisation. Pas de consommation de quota : cette détection
  // fait partie d'une analyse déjà comptée.
  const acces = await identifier(req);
  if (acces.erreur) return res.status(acces.code).json({ error: acces.erreur });

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
- N'invente jamais une pondération. Si elle est absente, mets ponderation_prix="Non précisée".

TYPOGRAPHIE, POUR LE CHAMP "description" QUI EST LU PAR LE CLIENT
- Aucun tiret cadratin ni demi-cadratin. Utilise la virgule, le point ou la parenthèse.
- Les deux-points servent uniquement à introduire une énumération, jamais à relier
  deux propositions.
- Typographie française : espace avant ; ! ? et avant les deux-points, guillemets « ».
- Aucun formatage Markdown, ni gras, ni puces.
- Une phrase, courte, factuelle. Aucun adjectif valorisant, aucune formule creuse.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
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
