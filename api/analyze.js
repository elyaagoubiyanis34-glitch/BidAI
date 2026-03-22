module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ao, secteur, effectif, refs } = req.body;
  if (!ao) return res.status(400).json({ error: 'AO manquant' });

  const prompt = `Tu es un expert en réponse aux appels d'offres B2B en France.
Analyse cet appel d'offres pour l'entreprise suivante.
ENTREPRISE : ${secteur} | ${effectif} | Références : ${refs}
AO : ${ao}

Réponds UNIQUEMENT avec ce JSON valide (sans backticks, sans texte avant ou après) :
{"score":75,"decision":"GO","decision_raison":"raison courte","resume_ao":"2-3 phrases","points_forts":["point 1","point 2","point 3"],"risques":["risque 1","risque 2"],"criteres":[{"nom":"Technique","score":80,"commentaire":"commentaire"},{"nom":"Références","score":70,"commentaire":"commentaire"},{"nom":"Prix","score":65,"commentaire":"commentaire"}],"draft_intro":"introduction 3-4 phrases à la première personne du pluriel","draft_methodo":"méthodologie 4-5 phrases","draft_equipe":"équipe 2-3 phrases","conseil_prix":"une phrase conseil prix"}
Remplace toutes les valeurs par l'analyse réelle de l'AO.`;

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
        max_tokens: 2000,
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
      () => { const c = raw.replace(/```json/gi,'').replace(/```/g,'').trim(); return JSON.parse(c); },
      () => { const c = raw.replace(/```json/gi,'').replace(/```/g,'').trim(); const m = c.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
    ]) { try { parsed = fn(); if (parsed) break; } catch(e) {} }

    if (!parsed) return res.status(500).json({ error: 'Format de réponse inattendu' });
    return res.status(200).json(parsed);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
