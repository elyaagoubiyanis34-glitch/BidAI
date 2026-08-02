const { createClient } = require('@supabase/supabase-js');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = require('docx');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GREEN = '0BBF6A';
const DARK = '1A1A12';
const MUTED = '6A6658';
const RED = 'D94F4F';
const AMBER = 'C97B10';

function h(text, level) {
  return new Paragraph({
    heading: level,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, color: DARK })]
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: String(text ?? ''), size: 22, color: opts.color || MUTED, bold: opts.bold || false })]
  });
}

function bullet(text, prefix, color) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: prefix + '  ', bold: true, color, size: 22 }),
      new TextRun({ text: String(text ?? ''), size: 22, color: MUTED })
    ]
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://getbidray.com');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth + plan Pro
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Session expirée' });
  const { data: profile } = await sb.from('profiles').select('plan').eq('id', user.id).maybeSingle();
  if (!profile || !['pro', 'business'].includes(profile.plan)) {
    return res.status(403).json({ error: 'Export Word réservé au plan Pro' });
  }

  const { result: r, objet } = req.body;
  if (!r) return res.status(400).json({ error: 'Résultat manquant' });

  const scMin = r.score_min ?? r.score ?? 0;
  const scMax = r.score_max ?? r.score ?? 0;
  const rs = r.resume || {};

  const children = [];

  // Header
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: 'Bid', bold: true, italics: true, size: 40, color: DARK }),
      new TextRun({ text: 'Flow', bold: true, italics: true, size: 40, color: GREEN })
    ]
  }));
  children.push(p('Brief stratégique d\'appel d\'offres — généré le ' + new Date().toLocaleDateString('fr-FR')));

  // Titre + décision
  children.push(h(objet || rs.objet || 'Analyse d\'appel d\'offres', HeadingLevel.HEADING_1));
  children.push(new Paragraph({
    spacing: { after: 160 },
    children: [
      new TextRun({ text: `Décision : ${r.decision || '—'}`, bold: true, size: 26, color: r.decision === 'GO' ? GREEN : (r.decision || '').includes('CONDITIONNEL') ? AMBER : RED }),
      new TextRun({ text: `   ·   Probabilité de succès : ${scMin}–${scMax} / 100`, size: 24, color: MUTED })
    ]
  }));
  if (r.decision_raison) children.push(p(r.decision_raison, { color: DARK }));

  // Résumé
  children.push(h('Résumé du marché', HeadingLevel.HEADING_2));
  [['Objet', rs.objet], ['Acheteur', rs.acheteur], ['Budget', rs.budget], ['Durée', rs.duree], ['Type', rs.type]].forEach(([k, v]) => {
    if (v) children.push(bullet(`${k} : ${v}`, '•', GREEN));
  });

  // Dates clés
  if ((r.dates_cles || []).length) {
    children.push(h('Dates clés', HeadingLevel.HEADING_2));
    r.dates_cles.forEach(d => children.push(bullet(`${d.label} : ${d.valeur}`, d.critique ? '⚠' : '•', d.critique ? RED : GREEN)));
  }

  // Critères
  if ((r.criteres || []).length) {
    children.push(h('Critères de notation — simulation en fourchette', HeadingLevel.HEADING_2));
    const rows = [new TableRow({
      children: ['Critère', 'Pondération', 'Note estimée', 'Commentaire'].map(t => new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 20, color: DARK })] })]
      }))
    })];
    r.criteres.forEach(c => {
      rows.push(new TableRow({
        children: [
          String(c.nom || ''), String(c.ponderation || '—'),
          `${c.note_min ?? '—'}–${c.note_max ?? '—'} / 20`, String(c.commentaire || '')
        ].map(t => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: t, size: 20, color: MUTED })] })]
        }))
      }));
    });
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    children.push(p('Fourchettes indicatives — la note réelle dépend de la commission d\'analyse des offres.', {}));
  }

  // Priorités
  if ((r.top_priorites || []).length) {
    children.push(h('Points à absolument adresser', HeadingLevel.HEADING_2));
    r.top_priorites.forEach((t, i) => children.push(bullet(t, `${i + 1}.`, DARK)));
  }

  // Attentes implicites
  if ((r.attentes_implicites || []).length) {
    children.push(h('Attentes implicites de l\'acheteur', HeadingLevel.HEADING_2));
    r.attentes_implicites.forEach(a => {
      children.push(bullet(a.signal, '⚡', AMBER));
      children.push(p('    ' + (a.attente || '')));
    });
  }

  // Clauses de vigilance
  if ((r.clauses_vigilance || []).length) {
    children.push(h('Clauses de vigilance', HeadingLevel.HEADING_2));
    r.clauses_vigilance.forEach(c => {
      children.push(bullet(`[${(c.gravite || 'moyenne').toUpperCase()}] ${c.clause}`, '⚠', RED));
      children.push(p('    ' + (c.risque || '')));
    });
  }

  // Points forts / risques
  if ((r.points_forts || []).length) {
    children.push(h('Points forts', HeadingLevel.HEADING_2));
    r.points_forts.forEach(t => children.push(bullet(t, '+', GREEN)));
  }
  if ((r.risques || []).length) {
    children.push(h('Risques identifiés', HeadingLevel.HEADING_2));
    r.risques.forEach(t => children.push(bullet(t, '–', RED)));
  }

  // Checklist
  if ((r.checklist_pieces || []).length) {
    children.push(h('Checklist des pièces à fournir', HeadingLevel.HEADING_2));
    r.checklist_pieces.forEach(pc => children.push(bullet(pc.piece + (pc.note ? ` — ${pc.note}` : ''), '☐', DARK)));
  }

  // Questions
  if ((r.questions_acheteur || []).length) {
    children.push(h('Questions à poser à l\'acheteur', HeadingLevel.HEADING_2));
    r.questions_acheteur.forEach(q => children.push(bullet(q, '?', GREEN)));
  }

  // Brouillon
  children.push(h('Brouillon de mémoire technique', HeadingLevel.HEADING_1));
  [['Introduction', r.draft_intro], ['Méthodologie', r.draft_methodo], ['Équipe projet', r.draft_equipe], ['Positionnement prix', r.conseil_prix]].forEach(([t, c]) => {
    if (c) {
      children.push(h(t, HeadingLevel.HEADING_2));
      children.push(p(c, { color: DARK }));
    }
  });

  // Footer
  children.push(new Paragraph({
    spacing: { before: 400 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Document généré par BidRay — getbidray.com — Analyse indicative, ne constitue pas un conseil juridique.', size: 16, color: MUTED, italics: true })]
  }));

  try {
    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename=BidRay-Analyse.docx');
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
