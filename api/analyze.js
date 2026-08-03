const { sb, entetes, identifier, verifierQuota, consommer } = require('./_acces');

/* ─── Statistiques anonymes ───────────────────────────────────────
   Aucune donnée identifiante : ni organisation, ni utilisateur, ni
   acheteur, ni objet du marché, ni contenu du dossier. Uniquement
   des caractéristiques structurelles, destinées à une publication
   agrégée. L'échec de l'enregistrement n'interrompt jamais l'analyse. */

function trancheEffectif(n) {
  const e = parseInt(n, 10);
  if (!e || isNaN(e)) return null;
  if (e < 10) return '1-9';
  if (e < 50) return '10-49';
  if (e < 200) return '50-199';
  return '200+';
}

function pourcentage(txt) {
  const m = String(txt || '').match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 0 && v <= 100 ? v : null;
}

function statistiques(parsed, ao, secteur, effectif) {
  const criteres = Array.isArray(parsed.criteres) ? parsed.criteres : [];
  const clauses  = Array.isArray(parsed.clauses_vigilance) ? parsed.clauses_vigilance : [];

  const estPrix = c => /prix|financ|co[uû]t|montant/i.test(c.nom || '');
  let pPrix = null, pTech = null;
  criteres.forEach(c => {
    const p = pourcentage(c.ponderation);
    if (p === null) return;
    if (estPrix(c)) pPrix = (pPrix || 0) + p;
    else pTech = (pTech || 0) + p;
  });

  let dominant = 'inconnu';
  if (pPrix !== null || pTech !== null) {
    const a = pPrix || 0, b = pTech || 0;
    dominant = a > b ? 'prix' : (b > a ? 'technique' : 'autre');
  }

  const nonPrecise = v => !v || /non pr[ée]cis/i.test(String(v));
  const resume = parsed.resume || {};
  const longueur = (ao || '').length;

  return {
    secteur: secteur || null,
    effectif_tranche: trancheEffectif(effectif),
    ao_caracteres: longueur,
    pages_estimees: longueur ? Math.max(1, Math.round(longueur / 2500)) : null,
    nb_criteres: criteres.length,
    ponderation_prix: pPrix,
    ponderation_technique: pTech,
    critere_dominant: dominant,
    type_marche: resume.type || null,
    budget_precise: !nonPrecise(resume.budget),
    duree_precisee: !nonPrecise(resume.duree),
    nb_clauses_vigilance: clauses.length,
    nb_clauses_gravite_haute: clauses.filter(c => /haute/i.test(c.gravite || '')).length,
    nb_pieces_checklist: Array.isArray(parsed.checklist_pieces) ? parsed.checklist_pieces.length : null,
    nb_questions_acheteur: Array.isArray(parsed.questions_acheteur) ? parsed.questions_acheteur.length : null,
    decision: parsed.decision || null,
    score_min: parsed.score_min ?? null,
    score_max: parsed.score_max ?? null
  };
}

module.exports = async function handler(req, res) {
  entetes(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Identité + organisation
  const acces = await identifier(req);
  if (acces.erreur) return res.status(acces.code).json({ error: acces.erreur });
  const { membre, org } = acces;

  if (membre.p_analyser === false) {
    return res.status(403).json({ error: "Vous n'avez pas le droit de lancer une analyse." });
  }

  // Quota contrôlé AVANT toute dépense
  const sig = (req.body && req.body.dossier_sig) || null;
  const droit = await verifierQuota(org, sig);
  if (!droit.autorise) return res.status(droit.code).json({ error: droit.motif });

  const { ao, secteur, effectif, refs, entreprise } = req.body;
  if (!ao) return res.status(400).json({ error: 'AO manquant' });

  const e = entreprise || {};
  const entrepriseBlock = [
    e.nom ? `Nom : ${e.nom}` : null,
    `Secteur : ${e.secteur || secteur || 'non précisé'}`,
    `Effectif : ${e.effectif || effectif || 'non précisé'}`,
    e.zone ? `Zone d'intervention : ${e.zone}` : null,
    e.ca ? `Chiffre d'affaires : ${e.ca}` : null,
    e.certifications ? `Certifications & agréments : ${e.certifications}` : null,
    `Références clés : ${e.references || refs || 'non précisées'}`,
    e.moyens ? `Moyens matériels : ${e.moyens}` : null,
    e.equipe ? `Équipe clé : ${e.equipe}` : null,
    e.differenciation ? `Points de différenciation : ${e.differenciation}` : null
  ].filter(Boolean).join('\n');

  const prompt = `Tu es un expert des marchés publics et privés français avec 15 ans d'expérience en réponse aux appels d'offres. Tu maîtrises parfaitement les DCE, CCTP, CCAP, RC, mémoires techniques, et tu connais les attentes implicites des acheteurs publics.

Tu analyses cet appel d'offres pour l'entreprise candidate suivante :
ENTREPRISE CANDIDATE :
${entrepriseBlock}

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
1. Notes TOUJOURS en fourchette (note_min/note_max sur 20), jamais une note unique, c'est une fausse précision.
2. Si une information n'est pas dans l'AO, écris exactement "Non précisé dans l'AO". N'invente JAMAIS de faits, dates, budgets ou noms.
3. Les critères et pondérations doivent être EXTRAITS du texte de l'AO. Si non précisés, indique "Pondération non précisée" et estime les critères probables.
4. Attentes implicites : déduis-les du CONTEXTE réel de l'AO (localisation, type de site, type d'acheteur, récurrence). Si aucun signal détectable, retourne un tableau avec un seul élément expliquant qu'aucun signal particulier n'est détectable dans le texte fourni.
5. Clauses de vigilance : cherche pénalités de retard, retenue de garantie, révision de prix absente, délais de paiement, résiliation aux motifs flous, assurances disproportionnées. Si le texte ne contient pas le CCAP, indique les clauses à VÉRIFIER en priorité dans le CCAP complet.
6. Le score global (score_min/score_max sur 100) reflète la probabilité de succès de CETTE entreprise sur CET AO, pas la qualité de l'AO.
7. Checklist : liste les pièces standard exigibles selon le type de marché détecté.
8. Dans les brouillons (draft_intro, draft_methodo, draft_equipe), utilise les VRAIES données de l'entreprise candidate (certifications, références, moyens, équipe) quand elles sont fournies, et n'invente JAMAIS un fait la concernant qui n'est pas listé.
9. Sois direct et concret. Tu parles à un dirigeant de PME, pas à un juriste.

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
        model: 'claude-sonnet-5',
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

    // Le quota n'est consommé qu'après un résultat exploitable
    parsed.quota = await consommer(org, droit.nouveau);

    // Statistiques anonymes. Aucune interruption possible de l'analyse.
    try {
      await sb.from('stats_analyses').insert(statistiques(parsed, ao, secteur, effectif));
    } catch (e) {
      console.error('Statistiques non enregistrées:', e.message);
    }

    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
