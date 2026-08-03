/* ─────────────────────────────────────────────────────────────────
   Agent rédacteur des Repères, publication autonome.

   Deux déclenchements :
     • Automatique, par Vercel Cron, deux fois par semaine.
       Vercel envoie « Authorization: Bearer $CRON_SECRET ».
     • Manuel, depuis /app/redacteur.html, avec AGENT_SECRET.

   Le sujet est pioché dans la table sujets_reperes. L'article est
   rédigé avec recherche web obligatoire, passe une série de contrôles,
   puis est publié directement. Deux tentatives avant abandon, la
   seconde recevant la liste des reproches faits à la première.
   Une notification par courriel signale chaque résultat.

   Variables d'environnement :
     ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
     RESEND_API_KEY, GITHUB_TOKEN, GITHUB_REPO   déjà présentes
     AGENT_SECRET   déclenchement manuel
     CRON_SECRET    déclenchement automatique
     ALERTE_EMAIL   adresse qui reçoit les notifications
   ───────────────────────────────────────────────────────────────── */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELE     = 'claude-sonnet-5';
const BASE       = 'https://getbidray.com';
const REFERENCE  = BASE + '/reperes/qu-est-ce-qu-un-dce.html';
const EXPEDITEUR = 'BidRay <contact@getbidray.com>';
const TENTATIVES = 2;

/* ════════════════════════════════════════ CONSIGNES DE RÉDACTION */

function consignes(sujet, angle, dateFr, reperes, reproches) {
  const liste = reperes.map(r => '  ' + r.url + '  ->  ' + r.titre).join('\n');
  const correctif = reproches && reproches.length
    ? '\n\nTENTATIVE PRÉCÉDENTE REFUSÉE. Corrige impérativement :\n' +
      reproches.map(e => '  - ' + e).join('\n') + '\n'
    : '';

  return `Tu rédiges un article pour « Repères », la section pédagogique de BidRay,
un outil d'analyse d'appels d'offres publics destiné aux PME françaises de 10 à 200
salariés qui répondent à plus de trois marchés par mois sans service dédié.

SUJET : ${sujet}
${angle ? 'ANGLE DEMANDÉ : ' + angle : ''}${correctif}

LECTEUR
Un dirigeant ou un responsable d'exploitation. Il connaît son métier, pas le droit
de la commande publique. Il lit entre deux rendez-vous. Il utilisera ce que tu écris
pour un marché à plusieurs dizaines de milliers d'euros.

VÉRIFICATION, RÈGLE LA PLUS IMPORTANTE
Tu disposes de la recherche web. Tu DOIS l'utiliser avant d'écrire le moindre chiffre.
Aucun seuil, aucun montant, aucun délai, aucun numéro d'article du code de la commande
publique ne peut sortir de ta mémoire. Les seuils français ont changé deux fois en 2026
et de nombreuses pages encore en ligne publient des valeurs périmées.
Sources acceptables : economie.gouv.fr, service-public.gouv.fr, legifrance.gouv.fr,
et les fiches de la Direction des affaires juridiques.
Si tu ne parviens pas à vérifier un chiffre, ne l'écris pas. Écris la règle sans le
chiffre, ou dis que la valeur doit être vérifiée au cas par cas.
La ligne de vérification finale doit nommer les sources réellement consultées.

RÉFÉRENCEMENT
Avant d'écrire, cherche comment un dirigeant de PME formule réellement cette question
dans un moteur de recherche. Identifie une requête principale et trois à cinq requêtes
proches. Écris ensuite l'article pour y répondre directement. La requête principale
doit apparaître, sans forçage, dans le titre, dans la première phrase du chapô, et dans
au moins un intertitre. N'écris jamais une phrase maladroite pour caser un mot-clé.

TYPOGRAPHIE, RÈGLES NON NÉGOCIABLES
A. Aucun tiret cadratin ni demi-cadratin, nulle part. Virgule, point, parenthèse.
B. Les deux-points introduisent une énumération, jamais deux propositions reliées.
C. Typographie française, espace avant ; ! ? et deux-points, guillemets « ».
D. Aucun Markdown. Ni gras, ni italique, ni titre en dièse, ni puces en tirets.
E. Formules creuses interdites : acteur incontournable, solution sur mesure, point
   d'honneur, à l'écoute de vos besoins, savoir-faire reconnu, partenaire de confiance,
   dans un souci de, il est important de noter, force est de constater, à l'heure où.
F. Aucun adjectif valorisant sans fait derrière.
G. Un seul connecteur logique par section au maximum.
H. Phrases courtes, une idée par phrase.

FORMAT DE SORTIE
Réponds UNIQUEMENT avec un objet JSON valide, sans backticks, sans préambule :
{
  "titre": "60 caractères maximum, sans deux-points, requête principale devant",
  "requete": "la requête principale visée",
  "requetes_proches": ["trois à cinq requêtes proches"],
  "description": "meta description, 140 à 165 caractères, contenant la requête principale",
  "duree": "7 min",
  "chapo": "3 à 4 phrases, sans balise HTML",
  "faq": [{"question": "...", "reponse": "..."}],
  "corps": "le HTML des sections"
}

CONTRAINTES SUR LE CHAMP corps
Balises autorisées, et aucune autre : h2, h3, p, ul, ol, li, strong, em, span, div, a.
Toute balise ouverte doit être refermée, dans le bon ordre. Aucun attribut autre que
class et href. Aucune image, aucun script, aucun style, aucun lien externe.

MARQUAGES MAISON
  <span class="fait">35 jours</span>
    Un fait mesuré et vérifiable. Chiffre, durée, montant, référence d'article.
    Entre 3 et 7 par article.
  <span class="promesse">l'ordre de la décision</span>
    Une formule courte qui porte la méthode. Jamais un chiffre.
    Entre 1 et 2 par article. JAMAIS à l'intérieur d'un encart.

ENCARTS, deux à quatre au total
  <div class="encart"><span class="k">À retenir</span><p>...</p></div>
  <div class="encart alerte"><span class="k">Le piège classique</span><p>...</p></div>

LIENS INTERNES, deux à quatre, placés là où le lecteur en a besoin
Le texte du lien décrit la destination, jamais « cliquez ici » ni « en savoir plus ».
  <a href="/reperes/le-memoire-technique.html">la structure d'un mémoire technique</a>
Repères existants, n'invente aucune autre adresse :
${liste}

QUESTIONS FRÉQUENTES, obligatoire
Termine le corps, juste avant la ligne de vérification, par :
  <h2>Questions fréquentes</h2>
puis trois à cinq blocs <h3>question</h3><p>réponse</p>. Les questions doivent être
identiques, mot pour mot, à celles du champ faq. Chaque réponse doit se suffire hors
contexte de l'article.

STRUCTURE
Quatre à six sections en h2, des h3 à l'intérieur, une conclusion opérationnelle en
étapes numérotées, puis les questions fréquentes.

DERNIÈRE LIGNE OBLIGATOIRE
<p class="verif">Vérifié le ${dateFr}, sur la base de [sources et articles réellement
consultés].<br><br>Les règles varient d'un marché à l'autre. Fiez-vous au règlement de
consultation que vous avez sous les yeux, et non à une règle générale, celle-ci comprise.</p>

Longueur : 1400 à 1800 mots dans le corps.`;
}

/* ═══════════════════════════════════════════════════ CONTRÔLES */

const BALISES_OK = ['h2','h3','p','ul','ol','li','strong','em','span','div','a','br'];
const CLASSES_OK = ['fait','promesse','encart','encart alerte','k','verif'];
const CREUSES = ['acteur incontournable','solution sur mesure',"point d'honneur",
  "à l'écoute de vos besoins",'savoir-faire reconnu','partenaire de confiance',
  'dans un souci de','il est important de noter','force est de constater',
  "à l'heure où",'nul doute que','plus que jamais'];

/* Vérifie que chaque balise ouverte est refermée dans le bon ordre.
   C'est le contrôle qui empêche un article de casser la mise en page. */
function balisesEquilibrees(html) {
  const pile = [];
  const auto = ['br','hr','img','meta','input'];
  const re = /<(\/?)([a-z0-9]+)[^>]*?(\/?)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const fermante = m[1] === '/', nom = m[2].toLowerCase(), autoFermante = m[3] === '/';
    if (auto.includes(nom) || autoFermante) continue;
    if (!fermante) { pile.push(nom); continue; }
    if (pile.length === 0) return 'balise fermante orpheline </' + nom + '>';
    const attendu = pile.pop();
    if (attendu !== nom) return 'balise mal imbriquée, </' + nom + '> alors que <' + attendu + '> est ouverte';
  }
  if (pile.length) return 'balise non refermée <' + pile[pile.length - 1] + '>';
  return null;
}

function valider(a, reperes, slugs) {
  const e = [];
  ['titre','description','chapo','corps','requete'].forEach(k => { if (!a[k]) e.push('Champ manquant : ' + k); });
  if (!a.corps) return e;

  const c = a.corps;
  const tout = [a.titre, a.description, a.chapo, c].join(' ');

  // Intégrité du HTML
  const desequilibre = balisesEquilibrees(c);
  if (desequilibre) e.push('HTML invalide, ' + desequilibre);

  const balises = [...c.matchAll(/<\/?([a-z0-9]+)/gi)].map(x => x[1].toLowerCase());
  [...new Set(balises)].forEach(b => { if (!BALISES_OK.includes(b)) e.push('Balise interdite : ' + b); });

  const attrs = [...c.matchAll(/<[a-z0-9]+\s+([^>]*)>/gi)]
    .flatMap(x => [...x[1].matchAll(/([a-z-]+)\s*=/gi)].map(y => y[1].toLowerCase()));
  [...new Set(attrs)].forEach(at => { if (!['class','href'].includes(at)) e.push('Attribut interdit : ' + at); });

  const classes = [...c.matchAll(/class="([^"]+)"/g)].map(x => x[1]);
  [...new Set(classes)].forEach(x => { if (!CLASSES_OK.includes(x)) e.push('Classe non autorisée : ' + x); });

  // Typographie
  if (/[—–]/.test(tout)) e.push('Tiret cadratin ou demi-cadratin présent');
  if (/\*\*|^#{1,6}\s|\n\s*[-*]\s/m.test(c)) e.push('Formatage Markdown présent');
  CREUSES.forEach(f => { if (tout.toLowerCase().includes(f.toLowerCase())) e.push('Formule creuse : ' + f); });

  // Marquages
  const faits = (c.match(/class="fait"/g) || []).length;
  const prom  = (c.match(/class="promesse"/g) || []).length;
  if (faits < 3 || faits > 8) e.push('Nombre de faits hors bornes (' + faits + ', attendu 3 à 8)');
  if (prom < 1 || prom > 3)   e.push('Nombre de promesses hors bornes (' + prom + ', attendu 1 à 3)');
  [...c.matchAll(/<div class="encart[^"]*">([\s\S]*?)<\/div>/g)].forEach(x => {
    if (/class="(fait|promesse)"/.test(x[1])) e.push("Marquage à l'intérieur d'un encart");
  });

  // Liens internes
  const urlsOk = reperes.map(r => r.url);
  const liens = [...c.matchAll(/<a\s+href="([^"]*)"/g)].map(x => x[1]);
  liens.forEach(h => { if (!urlsOk.includes(h)) e.push('Lien non autorisé : ' + h); });
  if (liens.length < 2 || liens.length > 5) e.push('Liens internes hors bornes (' + liens.length + ', attendu 2 à 5)');
  if (new Set(liens).size !== liens.length) e.push('Lien interne répété');
  if (/>(\s*)(cliquez ici|en savoir plus|ici|lire la suite|voir plus)(\s*)</i.test(c)) e.push('Texte de lien non descriptif');

  // Vérification et sources
  if (!/class="verif"/.test(c)) e.push('Ligne de vérification absente');
  if (!/Vérifié le/.test(c)) e.push('Date de vérification absente');
  const verif = (c.match(/class="verif">([\s\S]*?)<\/p>/) || [])[1] || '';
  if (!/(legifrance|economie\.gouv|service-public|affaires juridiques)/i.test(verif))
    e.push('Aucune source officielle nommée dans la ligne de vérification');

  // Référencement
  if (a.titre.length > 60) e.push('Titre trop long (' + a.titre.length + ' car., max 60)');
  if (a.titre.includes(':')) e.push('Deux-points dans le titre');
  if (a.description.length < 140 || a.description.length > 165)
    e.push('Meta description hors bornes (' + a.description.length + ' car., attendu 140 à 165)');
  if (!/Questions fréquentes/i.test(c)) e.push('Section Questions fréquentes absente');
  if (!Array.isArray(a.faq) || a.faq.length < 3 || a.faq.length > 5)
    e.push('Champ faq hors bornes (3 à 5 entrées attendues)');
  if (Array.isArray(a.faq)) a.faq.forEach((q, i) => {
    if (!q || !q.question || !q.reponse) e.push('Question ' + (i + 1) + ' incomplète');
    else if (!c.includes(q.question)) e.push('Question ' + (i + 1) + ' absente du corps');
  });
  const h2 = (c.match(/<h2>/g) || []).length;
  if (h2 < 4) e.push("Trop peu d'intertitres h2 (" + h2 + ', attendu au moins 4)');

  // Longueur
  const mots = c.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (mots < 900 || mots > 2200) e.push('Longueur hors bornes (' + mots + ' mots)');

  // Doublon
  const norm = t => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  reperes.forEach(r => { if (norm(r.titre) === norm(a.titre)) e.push('Titre identique à un repère existant'); });
  if (slugs && a.slug && slugs.includes(a.slug)) e.push('Article déjà publié à cette adresse');

  return e;
}

/* Contrôle final sur la page assemblée, juste avant publication. */
function validerPage(html) {
  const e = [];
  const ouv = (html.match(/<div/g) || []).length, fer = (html.match(/<\/div>/g) || []).length;
  if (ouv !== fer) e.push('Page finale, div déséquilibrés (' + ouv + ' ouverts, ' + fer + ' fermés)');
  if (!/<main>[\s\S]*<\/main>/.test(html)) e.push('Bloc main absent');
  if (!/class="art"/.test(html)) e.push("Corps d'article non inséré");
  const nav = (html.match(/<nav>[\s\S]*?<\/nav>/) || [''])[0];
  const nb = (nav.match(/>Repères</g) || []).length;
  if (nb !== 1) e.push('Navigation, ' + nb + ' entrées Repères au lieu de 1');
  if (!/className \+= ' anim'/.test(html)) e.push("Garde d'animation absente du gabarit");
  if (!/iom\.observe\(bloc\)/.test(html)) e.push("Observateur d'animation absent du gabarit");
  if (!/<title>/.test(html)) e.push('Titre de page absent');
  const visible = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
  if (/[—–]/.test(visible)) e.push('Tiret cadratin dans la page finale');
  return e;
}

/* Extrait le premier objet JSON complet, en ignorant les accolades
   situées à l'intérieur d'une chaîne de caractères. */
function extraireJson(txt) {
  const debut = txt.indexOf('{');
  if (debut === -1) return null;
  let niveau = 0, dansChaine = false, echappe = false;
  for (let i = debut; i < txt.length; i++) {
    const c = txt[i];
    if (echappe) { echappe = false; continue; }
    if (c === '\\') { echappe = true; continue; }
    if (c === '"') { dansChaine = !dansChaine; continue; }
    if (dansChaine) continue;
    if (c === '{') niveau++;
    else if (c === '}') { niveau--; if (niveau === 0) { try { return JSON.parse(txt.slice(debut, i + 1)); } catch { return null; } } }
  }
  return null;
}


/* ══════════════════════════════════ CHOIX AUTONOME DU SUJET */

async function appelModele(prompt, maxTokens, recherches) {
  const outils = recherches
    ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: recherches }]
    : undefined;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY
    },
    body: JSON.stringify({
      model: MODELE, max_tokens: maxTokens,
      tools: outils,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) throw new Error('API Anthropic ' + r.status + ' : ' + (await r.text()).slice(0, 300));
  const d = await r.json();
  return {
    blocs: (d.content || []).filter(b => b.type === 'text').map(b => b.text),
    recherches: (d.content || []).filter(b => b.type === 'server_tool_use').length,
    tronque: d.stop_reason === 'max_tokens'
  };
}

function lireJson(blocs) {
  for (const t of [...blocs].reverse().concat([blocs.join('\n')])) {
    const o = extraireJson(t.replace(/```json/gi, '').replace(/```/g, ''));
    if (o) return o;
  }
  return null;
}

/* L'agent décide seul du prochain sujet, à partir de ce qui est déjà
   publié et de ce que les dirigeants cherchent réellement. */
async function choisirSujet(reperes, dejaVus) {
  const publies = reperes.map(r => '  - ' + r.titre + '  (' + r.url + ')').join('\n');
  const ecartes = dejaVus.length ? '\nDéjà tenté ou publié, à ne pas reproposer :\n' +
    dejaVus.map(s => '  - ' + s).join('\n') : '';

  const p = `Tu choisis le prochain article à écrire pour « Repères », section pédagogique
de BidRay, outil d'analyse d'appels d'offres publics pour PME françaises de 10 à 200
salariés qui répondent à des marchés publics sans service dédié.

Articles déjà publiés :
${publies}${ecartes}

Sers-toi de la recherche web pour vérifier ce que les dirigeants de PME cherchent
réellement sur les marchés publics, et repérer un sujet qui n'est pas déjà couvert
ci-dessus.

Critères de choix, par ordre d'importance :
1. Le sujet répond à une question qu'un dirigeant se pose devant un dossier réel.
2. Il n'est traité par aucun des articles publiés, même partiellement.
3. Il correspond à une requête réellement tapée, pas à une curiosité théorique.
4. Il est assez précis pour tenir en 1500 mots, pas un thème général.
5. À intérêt égal, préfère un sujet de méthode ou de procédure, plus stable dans le
   temps, à un sujet dont la valeur repose uniquement sur des montants.

Réponds UNIQUEMENT avec ce JSON, sans backticks ni préambule :
{
  "sujet": "le sujet, formulé comme une consigne de rédaction",
  "slug": "adresse-en-minuscules-avec-tirets",
  "angle": "une phrase indiquant sous quel angle le traiter",
  "requete": "la requête principale que cet article doit capter",
  "justification": "une phrase expliquant pourquoi ce sujet maintenant"
}`;

  const r = await appelModele(p, 2000, 6);
  const o = lireJson(r.blocs);
  if (!o || !o.sujet || !o.slug) throw new Error('Choix de sujet non exploitable');
  o.slug = String(o.slug).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  if (!/^[a-z0-9-]+$/.test(o.slug)) throw new Error('Adresse proposée invalide');
  o.id = null;
  return o;
}

/* ═══════════════════════════ RELECTURE FACTUELLE INDÉPENDANTE

   Second appel au modèle, dans un rôle opposé : il ne rédige pas,
   il conteste. Sa mission est de trouver l'erreur, pas de valider.
   Un seul élément infirmé bloque la publication. */

async function relire(article, dateFr) {
  const texte = (article.chapo + ' ' + article.corps).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const p = `Tu es relecteur factuel. Ton travail n'est pas de valider ce texte, c'est
d'y trouver les erreurs. Un dirigeant de PME va s'en servir pour répondre à un marché
public de plusieurs dizaines de milliers d'euros. Une erreur lui coûte le marché.

Nous sommes le ${dateFr}.

TEXTE À CONTRÔLER
"""
${texte}
"""

MÉTHODE
1. Relève CHAQUE affirmation factuelle vérifiable : montant, seuil, délai, pourcentage,
   date, numéro d'article du code de la commande publique, nom d'organisme ou de
   formulaire, affirmation juridique du type « l'acheteur doit » ou « est obligatoire ».
2. Pour chacune, vérifie par recherche web sur les sources officielles uniquement :
   legifrance.gouv.fr, economie.gouv.fr, service-public.gouv.fr, entreprendre.service-public.gouv.fr.
3. Attention particulière aux seuils et aux montants : ils ont changé en 2026 et de
   nombreuses pages en ligne publient encore des valeurs périmées. Une valeur trouvée
   sur un site non officiel ne vaut pas confirmation.
4. Classe chaque affirmation :
   "confirme"     la source officielle dit exactement cela
   "infirme"      la source officielle dit autre chose, ou le texte est faux
   "invérifiable" tu n'as pas trouvé de source officielle qui tranche

Ne classe jamais "confirme" par défaut ni par vraisemblance. En cas de doute,
c'est "invérifiable".

Réponds UNIQUEMENT avec ce JSON, sans backticks ni préambule :
{
  "elements": [
    {"affirmation": "citation courte du texte",
     "statut": "confirme | infirme | inverifiable",
     "correction": "la valeur exacte si infirme, sinon chaine vide",
     "source": "domaine consulte"}
  ],
  "commentaire": "une phrase de synthese"
}`;

  const r = await appelModele(p, 8000, 12);
  const o = lireJson(r.blocs);
  if (!o || !Array.isArray(o.elements)) {
    return { verdict: 'refuse', motifs: ['Relecture factuelle non exploitable'], recherches: r.recherches };
  }

  const infirmes = o.elements.filter(x => x.statut === 'infirme');
  const flous    = o.elements.filter(x => x.statut === 'inverifiable');
  const confirmes = o.elements.filter(x => x.statut === 'confirme');

  const motifs = [];
  infirmes.forEach(x => motifs.push('FAUX : ' + x.affirmation + (x.correction ? ' -> ' + x.correction : '')));
  if (flous.length > 2) motifs.push(flous.length + ' affirmations non vérifiables : ' +
    flous.slice(0, 4).map(x => x.affirmation).join(' ; '));
  if (r.recherches === 0) motifs.push('Relecture effectuée sans aucune recherche web');
  if (o.elements.length === 0) motifs.push('Aucune affirmation factuelle relevée, relecture non fiable');

  return {
    verdict: motifs.length ? 'refuse' : 'valide',
    motifs, recherches: r.recherches,
    bilan: { total: o.elements.length, confirmes: confirmes.length,
             infirmes: infirmes.length, flous: flous.length },
    commentaire: o.commentaire || ''
  };
}

/* ══════════════════════════════════════════════════════ GITHUB */

async function gh(chemin, methode, corps) {
  const r = await fetch('https://api.github.com/repos/' + process.env.GITHUB_REPO + chemin, {
    method: methode || 'GET',
    headers: {
      'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'bidray-redacteur'
    },
    body: corps ? JSON.stringify(corps) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('GitHub ' + r.status + ' sur ' + chemin + ' : ' + (d.message || ''));
  return d;
}

const b64 = t => Buffer.from(t, 'utf8').toString('base64');
const echap = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/* ════════════════════════════════════════════════ NOTIFICATION */

async function prevenir(sujet, html) {
  const dest = process.env.ALERTE_EMAIL;
  if (!dest || !process.env.RESEND_API_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EXPEDITEUR, to: [dest], subject: sujet, html })
    });
  } catch (err) { console.error('Notification non envoyée:', err.message); }
}

/* ═════════════════════════════════════════════════ TRAITEMENT */

async function ecrireUnArticle(entree) {
  const maintenant = new Date();
  const iso = maintenant.toISOString().slice(0, 10);
  const dateFr = maintenant.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const url = '/reperes/' + entree.slug + '.html';

  // Repères publiés, lus en direct : l'agent ne peut lier que vers ce qui existe
  const hub = await (await fetch(BASE + '/reperes/')).text();
  const reperes = [...hub.matchAll(/<a class="rp-c" href="(\/reperes\/[a-z0-9-]+\.html)">[\s\S]*?<h3>([^<]+)<\/h3>/g)]
    .map(m => ({ url: m[1], titre: m[2].trim() }));
  if (reperes.length === 0) throw new Error('Aucun repère publié détecté sur la page de section');
  if (reperes.some(r => r.url === url)) throw new Error('Un article existe déjà à ' + url);
  const slugs = reperes.map(r => r.url.replace('/reperes/', '').replace('.html', ''));

  let article = null, reproches = [], recherches = 0;

  for (let essai = 1; essai <= TENTATIVES; essai++) {
    const rep = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: 16000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
        messages: [{ role: 'user', content: consignes(entree.sujet, entree.angle, dateFr, reperes, reproches) }]
      })
    });
    if (!rep.ok) throw new Error('API Anthropic ' + rep.status + ' : ' + (await rep.text()).slice(0, 300));

    const data = await rep.json();
    const blocs = (data.content || []).filter(b => b.type === 'text').map(b => b.text);
    recherches = (data.content || []).filter(b => b.type === 'server_tool_use').length;

    if (data.stop_reason === 'max_tokens') { reproches = ['Réponse tronquée, article trop long']; continue; }

    let candidat = null;
    for (const t of [...blocs].reverse().concat([blocs.join('\n')])) {
      candidat = extraireJson(t.replace(/```json/gi, '').replace(/```/g, ''));
      if (candidat && candidat.corps) break;
      candidat = null;
    }
    if (!candidat) { reproches = ['Réponse non exploitable, JSON absent ou incomplet']; continue; }

    candidat.slug = entree.slug;
    reproches = valider(candidat, reperes, slugs);
    if (recherches === 0) reproches.push('Aucune recherche web effectuée, chiffres non vérifiés');
    if (reproches.length === 0) { article = candidat; break; }
    console.log('Tentative ' + essai + ' refusée : ' + reproches.join(' | '));
  }

  if (!article) {
    const err = new Error('Article refusé après ' + TENTATIVES + ' tentatives');
    err.erreurs = reproches;
    throw err;
  }

  /* Assemblage : on clone une page publiée, la charte reste à jour toute seule */
  const gabarit = await (await fetch(REFERENCE)).text();

  const bloc = '<article class="art">\n  <div class="wrap">\n' +
    '    <p class="art-fil"><a href="/">BidRay</a> · <a href="/reperes/">Repères</a></p>\n' +
    '    <h1>' + echap(article.titre) + '</h1>\n' +
    '    <p class="art-meta">' + echap(article.duree || '7 min') + ' de lecture · Vérifié le ' + dateFr + '</p>\n\n' +
    '    <p class="art-chapo">' + article.chapo + '</p>\n' + article.corps + '\n  </div>\n\n' +
    '  <div class="wrap">\n    <div class="art-fin">\n' +
    '      <h3>Ce travail de lecture, BidRay le fait à votre place.</h3>\n' +
    "      <p>Déposez le dossier, obtenez les critères pondérés, les clauses à surveiller et une recommandation d'aller ou non. La première analyse est offerte, sans carte bancaire.</p>\n" +
    '      <a href="/app/login.html" class="btn btn-vt">Analyser un dossier gratuitement</a>\n' +
    '    </div>\n  </div>\n</article>';

  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', headline: article.titre, description: article.description, inLanguage: 'fr-FR',
        author: { '@type': 'Organization', name: 'BidRay', url: BASE },
        publisher: { '@type': 'Organization', name: 'BidRay', url: BASE },
        datePublished: iso, dateModified: iso,
        mainEntityOfPage: { '@type': 'WebPage', '@id': BASE + url } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BidRay', item: BASE },
        { '@type': 'ListItem', position: 2, name: 'Repères', item: BASE + '/reperes/' },
        { '@type': 'ListItem', position: 3, name: article.titre, item: BASE + url } ] },
      { '@type': 'FAQPage', mainEntity: (article.faq || []).map(q => ({
        '@type': 'Question', name: q.question,
        acceptedAnswer: { '@type': 'Answer', text: q.reponse } })) }
    ]
  }, null, 1);

  const page = gabarit
    .replace(/<main>[\s\S]*<\/main>/, '<main>\n' + bloc + '\n</main>')
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + echap(article.titre) + ' | Repères BidRay</title>')
    .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + echap(article.description) + '$2')
    .replace(/(<link rel="canonical" href="https:\/\/getbidray\.com)[^"]*(")/, '$1' + url + '$2')
    .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + echap(article.titre) + '$2')
    .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + echap(article.description) + '$2')
    .replace(/(<meta property="og:url" content="https:\/\/getbidray\.com)[^"]*(")/, '$1' + url + '$2')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      '<script type="application/ld+json">\n' + ld + '\n</script>');

  const errPage = validerPage(page);
  if (errPage.length) { const err = new Error('Page finale invalide'); err.erreurs = errPage; throw err; }

  /* Relecture factuelle indépendante. C'est le dernier verrou, et le seul
     qui porte sur le fond. Un chiffre infirmé bloque la publication. */
  const relecture = await relire(article, dateFr);
  if (relecture.verdict !== 'valide') {
    const err = new Error('Relecture factuelle refusée');
    err.erreurs = relecture.motifs;
    err.bilan = relecture.bilan;
    throw err;
  }

  /* Publication directe */
  await gh('/contents/reperes/' + entree.slug + '.html', 'PUT', {
    message: 'Repère : ' + article.titre, content: b64(page), branch: 'main'
  });

  // Plan du site
  try {
    const sm = await gh('/contents/sitemap.xml');
    const txt = Buffer.from(sm.content, 'base64').toString('utf8');
    if (!txt.includes(url)) {
      const x = '  <url>\n    <loc>' + BASE + url + '</loc>\n    <lastmod>' + iso + '</lastmod>\n' +
                '    <changefreq>yearly</changefreq>\n    <priority>0.7</priority>\n  </url>\n';
      await gh('/contents/sitemap.xml', 'PUT', {
        message: 'Plan du site : ' + entree.slug,
        content: b64(txt.replace('</urlset>', x + '</urlset>')), sha: sm.sha, branch: 'main'
      });
    }
  } catch (e) { console.error('Plan du site non mis à jour:', e.message); }

  // Carte sur la page de section
  let carte = false;
  try {
    const hubF = await gh('/contents/reperes/index.html');
    let txt = Buffer.from(hubF.content, 'base64').toString('utf8');
    const carteHtml = '        <a class="rp-c" href="' + url + '">\n' +
      '          <span class="k">Repère</span>\n' +
      '          <h3>' + echap(article.titre) + '</h3>\n' +
      '          <p>' + echap(article.description).slice(0, 130) + '</p>\n        </a>';
    const mots = t => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(w => w.length > 3);
    const cible = new Set(mots(entree.sujet + ' ' + article.titre));
    let meilleur = null, score = 0;
    [...txt.matchAll(/[ \t]*<div class="rp-c soon">[\s\S]*?<\/div>/g)].forEach(b => {
      const h3 = (b[0].match(/<h3>([^<]+)<\/h3>/) || [])[1] || '';
      const n = mots(h3).filter(w => cible.has(w)).length;
      if (n > score) { score = n; meilleur = b[0]; }
    });
    if (meilleur && score >= 2) { txt = txt.replace(meilleur, carteHtml); carte = true; }
    else {
      const fin = txt.lastIndexOf('    </div>\n    <p class="rp-note"');
      if (fin !== -1) { txt = txt.slice(0, fin) + carteHtml + '\n' + txt.slice(fin); carte = true; }
    }
    if (carte) await gh('/contents/reperes/index.html', 'PUT', {
      message: 'Repères : carte pour ' + entree.slug, content: b64(txt), sha: hubF.sha, branch: 'main'
    });
  } catch (e) { console.error('Carte non ajoutée:', e.message); }

  return {
    titre: article.titre, url: BASE + url, recherches, carte, requete: article.requete,
    mots: article.corps.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
    relecture: relecture.bilan, commentaire: relecture.commentaire
  };
}

/* ══════════════════════════════════════════════════════ HANDLER */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', BASE);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const entete = req.headers.authorization || '';
  const parCron  = !!process.env.CRON_SECRET  && entete === 'Bearer ' + process.env.CRON_SECRET;
  const corps    = req.body || {};
  const parAgent = !!process.env.AGENT_SECRET && corps.secret === process.env.AGENT_SECRET;

  if (!parCron && !parAgent) return res.status(401).json({ error: 'Non autorisé' });

  let entree = null;
  try {
    if (corps.sujet && corps.slug) {
      if (!/^[a-z0-9-]+$/.test(corps.slug)) return res.status(400).json({ error: 'slug invalide' });
      entree = { id: null, sujet: corps.sujet, slug: corps.slug, angle: corps.angle || null };
    } else {
      // Un sujet resté en file passe en premier, sinon l'agent choisit seul.
      const { data } = await sb.from('sujets_reperes').select('*')
        .eq('statut', 'attente').order('priorite').order('id').limit(1);

      if (data && data.length) {
        entree = data[0];
      } else {
        const hub0 = await (await fetch(BASE + '/reperes/')).text();
        const publies = [...hub0.matchAll(/<a class="rp-c" href="(\/reperes\/[a-z0-9-]+\.html)">[\s\S]*?<h3>([^<]+)<\/h3>/g)]
          .map(m => ({ url: m[1], titre: m[2].trim() }));
        const { data: passes } = await sb.from('sujets_reperes').select('sujet').limit(200);
        entree = await choisirSujet(publies, (passes || []).map(x => x.sujet));

        const { data: cree } = await sb.from('sujets_reperes').insert({
          sujet: entree.sujet, slug: entree.slug, angle: entree.angle,
          priorite: 50, statut: 'attente'
        }).select('id').single();
        if (cree) entree.id = cree.id;
        console.log('Sujet choisi par l\'agent :', entree.sujet, '|', entree.justification || '');
      }
    }

    const r = await ecrireUnArticle(entree);

    if (entree.id) await sb.from('sujets_reperes')
      .update({ statut: 'publie', url: r.url, traite_le: new Date().toISOString() })
      .eq('id', entree.id);

    await prevenir('Publié : ' + r.titre,
      '<p><strong>' + r.titre + '</strong></p>' +
      '<p><a href="' + r.url + '">' + r.url + '</a></p>' +
      '<p>Requête visée : ' + (r.requete || '') + '<br>Mots : ' + r.mots +
      ' · Recherches web : ' + r.recherches + ' · Carte ajoutée : ' + (r.carte ? 'oui' : 'non') + '</p>' +
      (r.relecture ? '<p><strong>Relecture factuelle</strong><br>' +
        r.relecture.total + ' affirmations relevées, ' + r.relecture.confirmes +
        ' confirmées sur source officielle, ' + r.relecture.flous + ' non vérifiables, ' +
        r.relecture.infirmes + ' infirmées.<br>' + (r.commentaire || '') + '</p>' : '') +
      "<p>Relisez les chiffres et les références d'articles. Pour retirer l'article, supprimez le fichier " +
      '<code>reperes/' + entree.slug + '.html</code> sur GitHub.</p>');

    return res.status(200).json(Object.assign({ ok: true }, r));

  } catch (err) {
    console.error('Rédacteur:', err.message, err.erreurs || '');
    if (entree && entree.id) await sb.from('sujets_reperes')
      .update({ statut: 'echec', erreurs: (err.erreurs || [err.message]).join(' | '),
                traite_le: new Date().toISOString() })
      .eq('id', entree.id);

    await prevenir('Échec de publication',
      '<p>' + err.message + '</p>' +
      (err.erreurs ? '<ul>' + err.erreurs.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '') +
      "<p>Rien n'a été publié.</p>");

    return res.status(500).json({ error: err.message, erreurs: err.erreurs || null });
  }
};
