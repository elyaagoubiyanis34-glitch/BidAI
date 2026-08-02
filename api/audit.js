const { entetes, identifier, verifierQuota, consommer } = require('./_acces');

module.exports = async function handler(req, res) {
  entetes(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Identité + organisation
  const acces = await identifier(req);
  if (acces.erreur) return res.status(acces.code).json({ error: acces.erreur });
  const { membre, org } = acces;

  if (membre.p_analyser === false) {
    return res.status(403).json({ error: "Vous n'avez pas le droit de lancer un audit." });
  }

  // Quota contrôlé AVANT toute dépense
  const sig = (req.body && req.body.dossier_sig) || null;
  const droit = await verifierQuota(org, sig);
  if (!droit.autorise) return res.status(droit.code).json({ error: droit.motif });

  const { memoire, rc, secteur, effectif, refs, entreprise } = req.body;
  if (!memoire) return res.status(400).json({ error: 'Mémoire technique manquant' });

  const e = entreprise || {};
  const entrepriseBlock = [
    e.nom ? `Nom : ${e.nom}` : null,
    `Secteur : ${e.secteur || secteur || 'non précisé'}`,
    `Effectif : ${e.effectif || effectif || 'non précisé'}`,
    e.zone ? `Zone d'intervention : ${e.zone}` : null,
    e.certifications ? `Certifications & agréments : ${e.certifications}` : null,
    `Références clés : ${e.references || refs || 'non précisées'}`,
    e.moyens ? `Moyens matériels : ${e.moyens}` : null,
    e.equipe ? `Équipe clé : ${e.equipe}` : null
  ].filter(Boolean).join('\n');

  const prompt = `Tu es un expert des marchés publics français avec 15 ans d'expérience comme membre de commissions d'analyse des offres ET comme rédacteur de mémoires techniques. Tu audites le mémoire technique d'une entreprise AVANT dépôt, comme un relecteur expert impitoyable mais constructif.

ENTREPRISE CANDIDATE :
${entrepriseBlock}

NOTE : si le mémoire n'exploite pas des atouts réels listés ci-dessus (certification pertinente non mentionnée, référence similaire absente), signale-le dans les recommandations, c'est un point facile à gagner.

${rc ? `RÈGLEMENT DE CONSULTATION / DCE (référentiel de notation) :\n${rc}\n` : `AUCUN RC FOURNI. Audite le mémoire selon les standards des commissions d'analyse des offres françaises (structure attendue, précision, preuves, personnalisation).`}

MÉMOIRE TECHNIQUE À AUDITER :
${memoire}

Réponds UNIQUEMENT avec ce JSON valide, sans backticks ni texte avant/après :
{
  "scores": {
    "conformite": {"min": 70, "max": 85, "commentaire": "réponse aux exigences explicites du RC/CCTP"},
    "pertinence": {"min": 60, "max": 75, "commentaire": "adéquation du contenu aux attentes et au contexte du marché"},
    "clarte": {"min": 65, "max": 80, "commentaire": "structure, lisibilité, facilité de notation pour la commission"},
    "differenciation": {"min": 50, "max": 65, "commentaire": "ce qui distingue ce mémoire d'un mémoire générique concurrent"}
  },
  "verdict": "2-3 phrases : l'état global du mémoire et le principal levier d'amélioration avant dépôt",
  "criteres": [
    {"nom": "critère du RC (ou critère standard si pas de RC)", "ponderation": "30% ou 'Non précisée'", "note_min": 12, "note_max": 15, "commentaire": "où ce mémoire gagne et perd des points sur ce critère"}
  ],
  "points_forts": ["3-5 vrais points forts du mémoire, avec référence à ce qui est bien fait"],
  "manques_critiques": [
    {"manque": "exigence du RC/CCTP non traitée ou section attendue absente", "impact": "conséquence probable sur la note ou risque d'irrégularité"}
  ],
  "a_clarifier": ["éléments vagues, non chiffrés ou non prouvés qui affaibliraient la notation"],
  "incoherences": ["contradictions internes : planning vs moyens, effectifs cités vs équipe décrite, promesses vs références"],
  "recommandations": [
    {"action": "action concrète et actionnable avant dépôt", "gravite": "haute ou moyenne ou faible"}
  ],
  "attentes_non_couvertes": [
    {"signal": "signal contextuel détecté dans le RC/marché (site occupé, école, récurrent...)", "attente": "ce que la commission attend et que le mémoire ne couvre pas"}
  ]
}

RÈGLES ABSOLUES :
1. Scores et notes TOUJOURS en fourchette, jamais une valeur unique.
2. N'invente RIEN : chaque manque, incohérence ou point fort doit être vérifiable dans les textes fournis. Si le RC n'est pas fourni, dis-le dans le verdict et audite sur les standards du métier.
3. manques_critiques = uniquement ce qui coûte réellement des points ou crée un risque d'élimination. Pas de remplissage.
4. Les recommandations sont classées par gravité et formulées comme des actions ("Ajouter un planning détaillé par phase avec jalons", pas "améliorer le planning").
5. Si le mémoire est court ou incomplet, dis-le franchement dans le verdict. Un audit complaisant ne sert à rien.
6. attentes_non_couvertes : seulement si un signal contextuel réel est détectable. Sinon tableau vide.
7. Tu parles à un dirigeant de PME : direct, concret, zéro jargon inutile.

TYPOGRAPHIE ET STYLE, RÈGLES NON NÉGOCIABLES
Ces textes sont lus par un dirigeant de PME, et les brouillons de mémoire sont remis
tels quels à un acheteur public. Ils ne doivent jamais avoir l'air générés.

A. Aucun tiret cadratin (—) ni demi-cadratin (–), nulle part, dans aucun champ.
   Utilise la virgule, le point, ou la parenthèse. Le trait d'union normal reste permis
   dans les mots composés.
B. Les deux-points servent uniquement à introduire une énumération ou une citation.
   Jamais pour relier deux propositions. "C'est une obligation : les critères figurent"
   devient "C'est une obligation. Les critères figurent".
C. Typographie française : espace avant ; ! ? et avant les deux-points. Guillemets
   français « ». Pas d'apostrophe droite, utilise l'apostrophe courbe.
D. Aucun formatage Markdown dans les champs de texte : ni **gras**, ni *italique*,
   ni #titre, ni puces. Ces textes partent en document Word.
E. Aucune formule creuse. Bannis notamment : "acteur incontournable", "solution
   sur mesure", "nous mettons un point d'honneur", "à l'écoute de vos besoins",
   "savoir-faire reconnu", "partenaire de confiance", "dans un souci de".
F. Aucun adjectif valorisant sans fait derrière. "Une équipe expérimentée" est interdit ;
   "une équipe de 4 agents, ancienneté moyenne 6 ans" est attendu.
G. Pas d'enchaînement de connecteurs. Au maximum un "par ailleurs", "en effet" ou
   "ainsi" par champ rédigé.
H. Phrases courtes. Une idée par phrase. Si une phrase dépasse deux lignes, coupe-la.
I. Dans les brouillons de mémoire, écris en paragraphes rédigés à la première personne
   du pluriel, pas en liste à puces, sauf si le règlement de consultation impose une trame.`;

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

    // Score global moyen (conformité + pertinence) pour l'historique
    const c = parsed.scores?.conformite || { min: 50, max: 50 };
    const p = parsed.scores?.pertinence || { min: 50, max: 50 };
    parsed.score = Math.round((c.min + c.max + p.min + p.max) / 4);

    // Le quota n'est consommé qu'après un résultat exploitable
    parsed.quota = await consommer(org, droit.nouveau);

    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
