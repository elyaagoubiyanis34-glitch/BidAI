const ipCache = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxRequests = 10;
  if (!ipCache.has(ip)) { ipCache.set(ip, { count: 1, start: now }); return false; }
  const data = ipCache.get(ip);
  if (now - data.start > windowMs) { ipCache.set(ip, { count: 1, start: now }); return false; }
  if (data.count >= maxRequests) return true;
  data.count++;
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipCache.entries()) {
    if (now - data.start > 60 * 60 * 1000) ipCache.delete(ip);
  }
}, 60 * 60 * 1000);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Trop de requêtes — réessayez dans une heure.' });
  }

  const { ao, secteur, effectif, refs } = req.body;
  if (!ao) return res.status(400).json({ error: 'AO manquant' });

  const prompt = `Tu es un expert des marchés publics et privés français avec 15 ans d'expérience en réponse aux appels d'offres. Tu maîtrises parfaitement les DCE, CCTP, CCAP, RC, mémoires techniques, et tu connais les attentes implicites des acheteurs publics.

Tu analyses cet appel d'offres pour l'entreprise candidate suivante :
ENTREPRISE : Secteur ${secteur || 'non précisé'} | Effectif ${effectif || 'non précisé'} | Références : ${refs || 'non précisées'}

APPEL D'OFFRES À ANALYSER :
${ao}

Réponds UNIQUEMENT avec ce JSON valide, sans backticks ni texte avant/après :
{
  "resume": {
    "objet": "objet du marché en une phrase",
    "acheteur": "nom du pouvoir adjudicateur ou donneur d'ordre",
    "budget": "budget si mentionné, sinon 'Non précisé dans l'AO'",
    "duree": "durée du marché si mentionnée, sinon 'Non précisé dans l'AO'",
    "type": "marché public / privé / accord-cadre / MAPA selon les indices"
  },
  "dates_cles": [
    {"label": "Remise des offres", "valeur": "date ou 'Non précisée'", "critique": true}
  ],
  "score_min": 55,
  "score_max": 70,
  "decision": "GO ou GO CONDITIONNEL ou NO-GO",
  "decision_raison": "raison claire en 1-2 phrases, adaptée au profil de l'entreprise",
  "criteres": [
    {"nom": "nom du critère tel qu'écrit dans l'AO", "ponderation": "60%", "note_min": 12, "note_max": 15, "commentaire": "évaluation courte de l'adéquation de l'entreprise sur ce critère"}
  ],
  "top_priorites": ["les 3 à 5 points à absolument adresser dans la réponse pour maximiser la note, classés par impact"],
  "attentes_implicites": [
    {"signal": "élément du contexte détecté (ex: site occupé, école à proximité, centre-ville, marché récurrent)", "attente": "ce que l'acheteur attend implicitement sans l'écrire"}
  ],
  "clauses_vigilance": [
    {"clause": "clause à risque repérée ou à vérifier dans le CCAP", "risque": "pourquoi c'est dangereux", "gravite": "haute ou moyenne ou faible"}
  ],
  "checklist_pieces": [
    {"piece": "nom de la pièce (DC1, DC2, DUME, mémoire technique, attestations...)", "note": "précision utile"}
  ],
  "questions_acheteur": ["1 à 3 questions pertinentes à poser à l'acheteur avant la date limite de questions"],
  "points_forts": ["3 points forts de l'entreprise face à cet AO"],
  "risques": ["2-3 risques ou faiblesses face à cet AO"],
  "draft_intro": "introduction du mémoire technique, 3-4 phrases à la première personne du pluriel, adaptée à l'entreprise et l'AO",
  "draft_methodo": "trame de méthodologie, 4-5 phrases structurées",
  "draft_equipe": "présentation équipe projet, 2-3 phrases",
  "conseil_prix": "conseil de positionnement prix en une phrase, basé sur la pondération prix/technique"
}

RÈGLES ABSOLUES :
1. Notes TOUJOURS en fourchette (note_min/note_max sur 20) — jamais une note unique, c'est une fausse précision.
2. Si une information n'est pas dans l'AO, écris exactement "Non précisé dans l'AO" — n'invente JAMAIS de faits, dates, budgets ou noms.
3. Les critères et pondérations doivent être EXTRAITS du texte de l'AO. Si non précisés, indique "Pondération non précisée" et estime les critères probables.
4. Attentes implicites : déduis-les du CONTEXTE réel de l'AO (localisation, type de site, type d'acheteur, récurrence). Si aucun signal détectable, retourne un tableau avec un seul élément expliquant qu'aucun signal particulier n'est détectable dans le texte fourni.
5. Clauses de vigilance : cherche pénalités de retard, retenue de garantie, révision de prix absente, délais de paiement, résiliation aux motifs flous, assurances disproportionnées. Si le texte ne contient pas le CCAP, indique les clauses à VÉRIFIER en priorité dans le CCAP complet.
6. Le score global (score_min/score_max sur 100) reflète la probabilité de succès de CETTE entreprise sur CET AO, pas la qualité de l'AO.
7. Checklist : liste les pièces standard exigibles selon le type de marché détecté.
8. Sois direct et concret — tu parles à un dirigeant de PME, pas à un juriste.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Erreur API: ${err.slice(0, 200)}` });
    }

    const data = await response.json();
    const raw = (data.content || []).map(b => b.text || '').join('');

    let parsed = null;
    for (const fn of [
      () => JSON.parse(raw.trim()),
      () => { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
      () => { const c = raw.replace(/```json/gi, '').replace(/```/g, '').trim(); return JSON.parse(c); },
      () => { const c = raw.replace(/```json/gi, '').replace(/```/g, '').trim(); const m = c.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
    ]) { try { parsed = fn(); if (parsed) break; } catch (e) {} }

    if (!parsed) return res.status(500).json({ error: 'Format de réponse inattendu' });

    // Score moyen pour compatibilité historique
    parsed.score = Math.round(((parsed.score_min || 50) + (parsed.score_max || 50)) / 2);

    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
