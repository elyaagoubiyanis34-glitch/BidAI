/* ─────────────────────────────────────────────────────────────
   Agent rédacteur des Repères.

   Il n'écrit jamais directement sur le site. Il produit un article,
   le valide contre une liste de règles, puis ouvre une pull request
   sur GitHub. Rien n'est publié tant que tu n'as pas fusionné.

   Variables d'environnement nécessaires :
     ANTHROPIC_API_KEY   déjà présente
     AGENT_SECRET        mot de passe que tu choisis, pour appeler l'agent
     GITHUB_TOKEN        jeton fine-grained, droits Contents + Pull requests
     GITHUB_REPO         elyaagoubiyanis34-glitch/BidRay

   Appel :
     POST /api/redacteur
     { "secret": "...", "sujet": "Les procédures : MAPA, appel d'offres ouvert, restreint",
       "slug": "les-procedures", "angle": "optionnel, une phrase" }
   ───────────────────────────────────────────────────────────── */

const MODELE     = 'claude-sonnet-5';
const REFERENCE  = 'https://getbidray.com/reperes/qu-est-ce-qu-un-dce.html';
const BASE       = 'https://getbidray.com';

/* ── Règles de rédaction. Ce bloc est la valeur de l'agent. ── */
function consignes(sujet, angle, dateFr, reperes) {
  const liste = reperes.map(r => `  ${r.url}  ->  ${r.titre}`).join('\n');
  return `Tu rédiges un article pour « Repères », la section pédagogique de BidRay,
un outil d'analyse d'appels d'offres publics destiné aux PME françaises de 10 à 200
salariés qui répondent à plus de trois marchés par mois sans service dédié.

SUJET : ${sujet}
${angle ? 'ANGLE DEMANDÉ : ' + angle : ''}

RÉFÉRENCEMENT, PREMIÈRE ÉTAPE
Avant d'écrire, cherche comment un dirigeant de PME formule réellement cette question
dans un moteur de recherche. Identifie une requête principale et trois à cinq requêtes
proches. Écris ensuite l'article pour y répondre directement.
La requête principale doit apparaître, sans forçage :
  - dans le titre, si possible dans les premiers mots
  - dans la première phrase du chapô
  - dans au moins un intertitre h2
Les requêtes proches se répartissent dans les intertitres et le corps. N'écris jamais
une phrase maladroite pour y caser un mot-clé : une phrase lourde coûte plus qu'elle
ne rapporte.

LECTEUR
Un dirigeant ou un responsable d'exploitation. Il connaît son métier, pas le droit
de la commande publique. Il lit entre deux rendez-vous. Il a un dossier à rendre.

VÉRIFICATION, RÈGLE LA PLUS IMPORTANTE
Tu disposes de la recherche web. Tu DOIS l'utiliser avant d'écrire le moindre
chiffre. Aucun seuil, aucun montant, aucun délai, aucun numéro d'article du code
de la commande publique ne peut sortir de ta mémoire. Les seuils français ont
changé en 2026 et de nombreuses pages encore en ligne publient des valeurs
périmées. Sources acceptables uniquement : economie.gouv.fr, service-public.gouv.fr,
legifrance.gouv.fr, et les fiches de la Direction des affaires juridiques.
Si tu ne parviens pas à vérifier un chiffre, ne l'écris pas. Écris la règle sans
le chiffre, ou dis que la valeur doit être vérifiée au cas par cas.

TYPOGRAPHIE, RÈGLES NON NÉGOCIABLES
A. Aucun tiret cadratin ni demi-cadratin, nulle part. Virgule, point, parenthèse.
B. Les deux-points introduisent une énumération, jamais deux propositions reliées.
C. Typographie française, espace avant ; ! ? et deux-points, guillemets « ».
D. Aucun Markdown. Ni gras, ni italique, ni titre en dièse.
E. Formules creuses interdites, notamment : acteur incontournable, solution sur
   mesure, point d'honneur, à l'écoute de vos besoins, savoir-faire reconnu,
   partenaire de confiance, dans un souci de, il est important de noter.
F. Aucun adjectif valorisant sans fait derrière.
G. Un seul connecteur logique par section, au maximum.
H. Phrases courtes, une idée par phrase.

FORMAT DE SORTIE
Réponds UNIQUEMENT avec un objet JSON, sans backticks, sans préambule :
{
  "titre": "titre de l'article, 60 caractères maximum, sans deux-points, requête principale devant",
  "requete": "la requête principale visée, telle qu'un dirigeant la taperait",
  "requetes_proches": ["trois à cinq requêtes proches"],
  "faq": [{"question": "...", "reponse": "..."}],
  "description": "meta description, 140 à 165 caractères, contenant la requête principale",
  "duree": "6 min",
  "chapo": "3 à 4 phrases, sans balise HTML",
  "corps": "le HTML des sections, voir ci-dessous"
}

Le champ "corps" contient uniquement des balises h2, h3, p, ul, ol, li, strong, em,
et les deux marquages maison ci-dessous. Jamais de script, de style, d'iframe,
d'image, de lien externe, ni de classe autre que celles listées.

MARQUAGES MAISON, à utiliser avec parcimonie
  <span class="fait">35 jours</span>
    Un fait mesuré et vérifiable. Chiffre, durée, montant, référence d'article.
    Entre 3 et 6 par article.
  <span class="promesse">l'ordre de la décision</span>
    Une formule courte qui porte la méthode ou l'engagement. Jamais un chiffre.
    Entre 1 et 2 par article. Jamais à l'intérieur d'un encart.

ENCARTS, deux types
  <div class="encart"><span class="k">À retenir</span><p>...</p></div>
  <div class="encart alerte"><span class="k">Le piège classique</span><p>...</p></div>
  Deux à quatre au total. Le titre du span varie selon le contenu.

STRUCTURE ATTENDUE
Quatre à six sections en h2, des h3 à l'intérieur si besoin, et une conclusion
opérationnelle qui donne une méthode en étapes numérotées.

DERNIÈRE LIGNE OBLIGATOIRE
Le corps se termine impérativement par ce paragraphe, adapté :
<p class="verif">Vérifié le ${dateFr}, sur la base de [sources et articles réellement
consultés].<br><br>Les règles varient d'un marché à l'autre. Fiez-vous au règlement
de consultation que vous avez sous les yeux, et non à une règle générale,
celle-ci comprise.</p>

LIENS INTERNES, OBLIGATOIRE
Place deux à quatre liens vers les repères existants, à l'endroit du texte où le
lecteur en a réellement besoin. Le texte du lien décrit la destination, jamais
« cliquez ici » ni « en savoir plus ». Format exact :
  <a href="/reperes/le-memoire-technique.html">la structure d'un mémoire technique</a>
Repères disponibles :
${liste}
N'invente aucune autre URL. Aucun lien vers l'extérieur.

QUESTIONS FRÉQUENTES, OBLIGATOIRE
Termine le corps, juste avant la ligne de vérification, par une section :
  <h2>Questions fréquentes</h2>
puis trois à cinq blocs de cette forme exacte :
  <h3>La question, telle qu'un dirigeant la poserait</h3>
  <p>La réponse, deux à quatre phrases, autonome et directement utile.</p>
Ces questions doivent être celles réellement posées sur le sujet, pas des questions
de confort. Chaque réponse doit se suffire à elle-même, hors contexte de l'article.

Longueur cible : 1400 à 1800 mots dans le corps, questions fréquentes comprises.`;
}

/* ── Contrôles automatiques. Un seul échec bloque la pull request. ── */
function valider(a, reperes) {
  const urlsOk = reperes.map(r => r.url);
  const e = [];
  const c = a.corps || '';
  const tout = [a.titre, a.description, a.chapo, c].join(' ');

  if (/[—–]/.test(tout)) e.push('Tiret cadratin ou demi-cadratin présent');
  if (/\*\*|^#{1,6}\s|\n\s*[-*]\s/m.test(c)) e.push('Formatage Markdown présent');
  if (/<(script|style|iframe|img)\b/i.test(c)) e.push('Balise interdite (script, style, iframe ou img)');

  // Seuls les liens internes vers un repère existant sont autorisés
  const liens = [...c.matchAll(/<a\s+href="([^"]*)"/g)].map(m => m[1]);
  liens.forEach(h => { if (!urlsOk.includes(h)) e.push('Lien non autorisé : ' + h); });
  if (liens.length < 2 || liens.length > 5) e.push(`Nombre de liens internes hors bornes (${liens.length}, attendu 2 à 5)`);
  if (/>(\s*)(cliquez ici|en savoir plus|ici|lire la suite)(\s*)</i.test(c)) e.push('Texte de lien non descriptif');

  const classes = [...c.matchAll(/class="([^"]+)"/g)].map(m => m[1]);
  const permises = ['fait', 'promesse', 'encart', 'encart alerte', 'k', 'verif'];
  classes.filter(x => !permises.includes(x)).forEach(x => e.push('Classe non autorisée : ' + x));

  const faits = (c.match(/class="fait"/g) || []).length;
  const prom  = (c.match(/class="promesse"/g) || []).length;
  if (faits < 3 || faits > 8) e.push(`Nombre de faits hors bornes (${faits}, attendu 3 à 8)`);
  if (prom  < 1 || prom  > 3) e.push(`Nombre de promesses hors bornes (${prom}, attendu 1 à 3)`);

  // Un marquage à l'intérieur d'un encart donnerait du jaune sur du jaune
  [...c.matchAll(/<div class="encart[^"]*">([\s\S]*?)<\/div>/g)]
    .forEach(m => { if (/class="(fait|promesse)"/.test(m[1])) e.push('Marquage à l\'intérieur d\'un encart'); });

  if (!/class="verif"/.test(c)) e.push('Ligne de vérification absente');
  if (!/Vérifié le/.test(c))   e.push('Date de vérification absente');

  const creuses = ['acteur incontournable', 'solution sur mesure', 'point d\'honneur',
                   'à l\'écoute de vos besoins', 'savoir-faire reconnu', 'partenaire de confiance',
                   'dans un souci de', 'il est important de noter'];
  creuses.forEach(f => { if (tout.toLowerCase().includes(f)) e.push('Formule creuse : ' + f); });

  const ouv = (c.match(/<div/g) || []).length, fer = (c.match(/<\/div>/g) || []).length;
  if (ouv !== fer) e.push(`Balises div déséquilibrées (${ouv} ouvertes, ${fer} fermées)`);

  const mots = c.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (mots < 600 || mots > 1600) e.push(`Longueur hors bornes (${mots} mots)`);

  ['titre', 'description', 'chapo', 'corps'].forEach(k => { if (!a[k]) e.push('Champ manquant : ' + k); });
  if (a.titre && a.titre.includes(':')) e.push('Deux-points dans le titre');

  // Contrôles de référencement
  if (a.titre && a.titre.length > 60) e.push(`Titre trop long pour un résultat de recherche (${a.titre.length} car., max 60)`);
  if (a.description && (a.description.length < 140 || a.description.length > 165))
    e.push(`Meta description hors bornes (${a.description.length} car., attendu 140 à 165)`);
  if (!/Questions fréquentes/i.test(c)) e.push('Section Questions fréquentes absente');
  if (!Array.isArray(a.faq) || a.faq.length < 3 || a.faq.length > 5)
    e.push('Champ faq absent ou hors bornes (3 à 5 entrées attendues)');
  if (Array.isArray(a.faq)) a.faq.forEach((q, i) => {
    if (!q || !q.question || !q.reponse) e.push(`Question ${i + 1} incomplète`);
  });
  if (!a.requete) e.push('Champ requete absent');
  const h2 = (c.match(/<h2>/g) || []).length;
  if (h2 < 4) e.push(`Trop peu d'intertitres h2 (${h2}, attendu au moins 4)`);

  return e;
}

/* ── Appels GitHub ── */
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

const b64 = txt => Buffer.from(txt, 'utf8').toString('base64');

/* Extrait le premier objet JSON complet d'un texte, en comptant les accolades
   et en ignorant celles qui se trouvent à l'intérieur d'une chaîne.
   Une expression régulière gloutonne échoue dès que le modèle commente ses
   recherches avant de répondre. */
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
    else if (c === '}') {
      niveau--;
      if (niveau === 0) {
        try { return JSON.parse(txt.slice(debut, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', BASE);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { secret, sujet, slug, angle } = req.body || {};
  if (!process.env.AGENT_SECRET || secret !== process.env.AGENT_SECRET) {
    return res.status(401).json({ error: 'Secret invalide' });
  }
  if (!sujet || !slug) return res.status(400).json({ error: 'sujet et slug requis' });
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'slug invalide' });

  const maintenant = new Date();
  const iso = maintenant.toISOString().slice(0, 10);
  const dateFr = maintenant.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  try {
    /* 0. Liste des repères déjà publiés, lue en direct sur le site.
          L'agent ne peut donc lier que vers des pages qui existent,
          et la liste s'enrichit toute seule à chaque publication. */
    const hub = await (await fetch(BASE + '/reperes/')).text();
    const reperes = [...hub.matchAll(/<a class="rp-c" href="(\/reperes\/[a-z0-9-]+\.html)">[\s\S]*?<h3>([^<]+)<\/h3>/g)]
      .map(m => ({ url: m[1], titre: m[2].trim() }));
    if (reperes.length === 0) return res.status(500).json({ error: 'Aucun repère publié détecté sur la page de section' });

    /* 1. Rédaction, avec recherche web obligatoire */
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
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
        messages: [{ role: 'user', content: consignes(sujet, angle, dateFr, reperes) }]
      })
    });
    if (!rep.ok) return res.status(502).json({ error: 'Erreur API Anthropic', detail: await rep.text() });

    const data = await rep.json();
    const blocs = (data.content || []).filter(b => b.type === 'text').map(b => b.text);
    const recherches = (data.content || []).filter(b => b.type === 'server_tool_use').length;

    if (data.stop_reason === 'max_tokens') {
      return res.status(500).json({
        error: 'Réponse tronquée, l\'article était trop long',
        conseil: 'Relancez. Si cela se répète, demandez un sujet plus étroit.',
        recherches
      });
    }

    // On tente le dernier bloc en premier, puis les précédents, puis l'ensemble.
    let article = null;
    for (const t of [...blocs].reverse().concat([blocs.join('\n')])) {
      const propre = t.replace(/```json/gi, '').replace(/```/g, '');
      article = extraireJson(propre);
      if (article && article.corps) break;
      article = null;
    }

    if (!article) {
      const apercu = (blocs[blocs.length - 1] || blocs.join('\n') || '').slice(-1200);
      return res.status(500).json({
        error: 'Réponse non exploitable',
        conseil: 'Le modèle n\'a pas renvoyé de JSON complet. Relancez : le résultat varie.',
        recherches, blocs_texte: blocs.length, stop_reason: data.stop_reason,
        apercu
      });
    }

    /* 2. Contrôles. Aucune pull request si un seul échoue. */
    const erreurs = valider(article, reperes);
    if (recherches === 0) erreurs.push('Aucune recherche web effectuée, chiffres non vérifiés');
    if (erreurs.length) return res.status(422).json({ error: 'Article refusé', erreurs, article });

    /* 3. Habillage : on réutilise un article publié comme gabarit,
          ce qui garde la charte automatiquement à jour. */
    const gabarit = await (await fetch(REFERENCE)).text();
    const url = '/reperes/' + slug + '.html';
    const echap = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    const bloc = `<article class="art">
  <div class="wrap">
    <p class="art-fil"><a href="/">BidRay</a> · <a href="/reperes/">Repères</a></p>
    <h1>${echap(article.titre)}</h1>
    <p class="art-meta">${echap(article.duree || '7 min')} de lecture · Vérifié le ${dateFr}</p>

    <p class="art-chapo">${article.chapo}</p>
${article.corps}
  </div>

  <div class="wrap">
    <div class="art-fin">
      <h3>Ce travail de lecture, BidRay le fait à votre place.</h3>
      <p>Déposez le dossier, obtenez les critères pondérés, les clauses à surveiller et une recommandation d'aller ou non. La première analyse est offerte, sans carte bancaire.</p>
      <a href="/app/login.html" class="btn btn-vt">Analyser un dossier gratuitement</a>
    </div>
  </div>
</article>`;

    let page = gabarit
      .replace(/<main>[\s\S]*<\/main>/, '<main>\n' + bloc + '\n</main>')
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${echap(article.titre)} | Repères BidRay</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${echap(article.description)}$2`)
      .replace(/(<link rel="canonical" href="https:\/\/getbidray\.com)[^"]*(")/, `$1${url}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${echap(article.titre)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${echap(article.description)}$2`)
      .replace(/(<meta property="og:url" content="https:\/\/getbidray\.com)[^"]*(")/, `$1${url}$2`)
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        '<script type="application/ld+json">\n' + JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Article',
              headline: article.titre,
              description: article.description,
              inLanguage: 'fr-FR',
              author: { '@type': 'Organization', name: 'BidRay', url: BASE },
              publisher: { '@type': 'Organization', name: 'BidRay', url: BASE },
              datePublished: iso,
              dateModified: iso,
              mainEntityOfPage: { '@type': 'WebPage', '@id': BASE + url }
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'BidRay', item: BASE },
                { '@type': 'ListItem', position: 2, name: 'Repères', item: BASE + '/reperes/' },
                { '@type': 'ListItem', position: 3, name: article.titre, item: BASE + url }
              ]
            },
            {
              '@type': 'FAQPage',
              mainEntity: (article.faq || []).map(q => ({
                '@type': 'Question',
                name: q.question,
                acceptedAnswer: { '@type': 'Answer', text: q.reponse }
              }))
            }
          ]
        }, null, 1) + '\n</script>');

    /* 4. Branche, fichier, plan du site, pull request */
    const branche = 'reperes/' + slug + '-' + iso;
    const main = await gh('/git/ref/heads/main');
    await gh('/git/refs', 'POST', { ref: 'refs/heads/' + branche, sha: main.object.sha });

    await gh('/contents/reperes/' + slug + '.html', 'PUT', {
      message: 'Repère : ' + article.titre,
      content: b64(page), branch: branche
    });

    const sm = await gh('/contents/sitemap.xml?ref=' + branche);
    const smTxt = Buffer.from(sm.content, 'base64').toString('utf8');
    if (!smTxt.includes(url)) {
      const entree = `  <url>\n    <loc>${BASE}${url}</loc>\n    <lastmod>${iso}</lastmod>\n` +
                     `    <changefreq>yearly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      await gh('/contents/sitemap.xml', 'PUT', {
        message: 'Plan du site : ' + slug,
        content: b64(smTxt.replace('</urlset>', entree + '</urlset>')),
        sha: sm.sha, branch: branche
      });
    }

    const pr = await gh('/pulls', 'POST', {
      title: 'Repère : ' + article.titre,
      head: branche, base: 'main',
      body: `**Sujet** : ${sujet}\n**Requête principale visée** : ${article.requete}\n` +
            `**Requêtes proches** : ${(article.requetes_proches || []).join(', ')}\n` +
            `**Recherches web effectuées** : ${recherches}\n` +
            `**Liens internes** : ${(article.corps.match(/<a href="\/reperes\//g) || []).length}\n` +
            `**Questions fréquentes** : ${(article.faq || []).length}\n` +
            `**Contrôles automatiques** : tous passés\n\n` +
            `À faire avant de fusionner :\n` +
            `- [ ] Relire les chiffres et les références d'articles\n` +
            `- [ ] Vérifier que la date de vérification est correcte\n` +
            `- [ ] Ajouter la carte correspondante dans \`reperes/index.html\`\n\n` +
            `Article rédigé automatiquement. Rien n'est en ligne tant que cette pull request n'est pas fusionnée.`
    });

    return res.status(200).json({
      ok: true, url: BASE + url, pull_request: pr.html_url,
      titre: article.titre, recherches
    });

  } catch (err) {
    console.error('Rédacteur:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
