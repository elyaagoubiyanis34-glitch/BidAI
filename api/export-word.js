const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Vérifie l'auth
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non autorisé' });

  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Non autorisé' });

  // Vérifie le plan Pro
  const { data: profile } = await sb.from('profiles').select('plan').eq('id', user.id).single();
  if (!profile || !['pro', 'business'].includes(profile.plan)) {
    return res.status(403).json({ error: 'Export Word disponible sur le plan Pro uniquement' });
  }

  const { result, objet } = req.body;
  if (!result) return res.status(400).json({ error: 'Données manquantes' });

  try {
    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
      LevelFormat
    } = require('docx');

    const GREEN = '0BBF6A';
    const DARK = '1A1A12';
    const MUTED = '6A6658';
    const LIGHT_GREEN = 'E6F8EF';
    const border = { style: BorderStyle.SINGLE, size: 1, color: 'E0DDD3' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

    const sc = result.score || 0;
    const decColor = sc >= 65 ? '0BBF6A' : sc >= 40 ? 'C97B10' : 'D94F4F';

    // Paragraphe vide
    const spacer = () => new Paragraph({ children: [new TextRun('')], spacing: { after: 120 } });

    // Séparateur
    const divider = () => new Paragraph({
      children: [new TextRun('')],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E0DDD3', space: 1 } },
      spacing: { after: 240 }
    });

    // Ligne de liste à puces
    const bullet = (text) => new Paragraph({
      numbering: { reference: 'bullets', level: 0 },
      children: [new TextRun({ text, font: 'Arial', size: 22, color: DARK })]
    });

    const doc = new Document({
      numbering: {
        config: [{
          reference: 'bullets',
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }]
        }]
      },
      styles: {
        default: {
          document: { run: { font: 'Arial', size: 22, color: DARK } }
        },
        paragraphStyles: [
          {
            id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 36, bold: true, font: 'Arial', color: DARK },
            paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 }
          },
          {
            id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 26, bold: true, font: 'Arial', color: GREEN },
            paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1 }
          }
        ]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children: [

          // ─── EN-TÊTE BRANDING ───
          new Paragraph({
            children: [
              new TextRun({ text: 'BID', font: 'Arial', size: 48, bold: true, color: DARK }),
              new TextRun({ text: 'AI', font: 'Arial', size: 48, bold: true, color: GREEN }),
              new TextRun({ text: '  —  Analyse d\'appel d\'offres', font: 'Arial', size: 24, color: MUTED }),
            ],
            spacing: { after: 60 }
          }),
          new Paragraph({
            children: [new TextRun({ text: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), font: 'Arial', size: 18, color: MUTED })],
            border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GREEN, space: 1 } },
            spacing: { after: 400 }
          }),

          spacer(),

          // ─── OBJET DE L'AO ───
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: objet || 'Appel d\'offres analysé', font: 'Arial', size: 36, bold: true, color: DARK })]
          }),

          spacer(),

          // ─── TABLEAU SCORE ───
          new Table({
            width: { size: 9026, type: WidthType.DXA },
            columnWidths: [4513, 4513],
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders,
                    width: { size: 4513, type: WidthType.DXA },
                    shading: { fill: LIGHT_GREEN, type: ShadingType.CLEAR },
                    margins: { top: 200, bottom: 200, left: 200, right: 200 },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `${sc}/100`, font: 'Arial', size: 64, bold: true, color: decColor })]
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'Score de pertinence', font: 'Arial', size: 20, color: MUTED })]
                      })
                    ]
                  }),
                  new TableCell({
                    borders,
                    width: { size: 4513, type: WidthType.DXA },
                    shading: { fill: 'F8F8F6', type: ShadingType.CLEAR },
                    margins: { top: 200, bottom: 200, left: 200, right: 200 },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: result.decision || '—', font: 'Arial', size: 48, bold: true, color: decColor })]
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: result.decision_raison || '', font: 'Arial', size: 18, color: MUTED })]
                      })
                    ]
                  })
                ]
              })
            ]
          }),

          spacer(), spacer(),

          // ─── RÉSUMÉ ───
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Résumé de l\'appel d\'offres', font: 'Arial', size: 26, bold: true, color: GREEN })] }),
          new Paragraph({ children: [new TextRun({ text: result.resume_ao || '', font: 'Arial', size: 22, color: DARK })], spacing: { after: 240 } }),

          divider(),

          // ─── POINTS FORTS ───
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Points forts', font: 'Arial', size: 26, bold: true, color: GREEN })] }),
          ...(result.points_forts || []).map(p => bullet(p)),

          spacer(),

          // ─── RISQUES ───
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Risques identifiés', font: 'Arial', size: 26, bold: true, color: 'D94F4F' })] }),
          ...(result.risques || []).map(r => bullet(r)),

          spacer(),
          divider(),

          // ─── CRITÈRES ───
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Adéquation par critère', font: 'Arial', size: 26, bold: true, color: GREEN })] }),

          new Table({
            width: { size: 9026, type: WidthType.DXA },
            columnWidths: [3600, 1800, 3626],
            rows: [
              // Header
              new TableRow({
                tableHeader: true,
                children: [
                  new TableCell({
                    borders, shading: { fill: '1A1A12', type: ShadingType.CLEAR },
                    width: { size: 3600, type: WidthType.DXA },
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Critère', font: 'Arial', size: 20, bold: true, color: 'FFFFFF' })] })]
                  }),
                  new TableCell({
                    borders, shading: { fill: '1A1A12', type: ShadingType.CLEAR },
                    width: { size: 1800, type: WidthType.DXA },
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Score', font: 'Arial', size: 20, bold: true, color: 'FFFFFF' })] })]
                  }),
                  new TableCell({
                    borders, shading: { fill: '1A1A12', type: ShadingType.CLEAR },
                    width: { size: 3626, type: WidthType.DXA },
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Commentaire', font: 'Arial', size: 20, bold: true, color: 'FFFFFF' })] })]
                  })
                ]
              }),
              // Rows
              ...(result.criteres || []).map((c, i) => {
                const sc2 = c.score || 0;
                const fill = i % 2 === 0 ? 'FFFFFF' : 'F8F8F6';
                const scoreColor = sc2 >= 65 ? GREEN : sc2 >= 40 ? 'C97B10' : 'D94F4F';
                return new TableRow({
                  children: [
                    new TableCell({
                      borders, shading: { fill, type: ShadingType.CLEAR },
                      width: { size: 3600, type: WidthType.DXA },
                      margins: { top: 100, bottom: 100, left: 150, right: 150 },
                      children: [new Paragraph({ children: [new TextRun({ text: c.nom || '', font: 'Arial', size: 20, bold: true, color: DARK })] })]
                    }),
                    new TableCell({
                      borders, shading: { fill, type: ShadingType.CLEAR },
                      width: { size: 1800, type: WidthType.DXA },
                      margins: { top: 100, bottom: 100, left: 150, right: 150 },
                      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${sc2}%`, font: 'Arial', size: 20, bold: true, color: scoreColor })] })]
                    }),
                    new TableCell({
                      borders, shading: { fill, type: ShadingType.CLEAR },
                      width: { size: 3626, type: WidthType.DXA },
                      margins: { top: 100, bottom: 100, left: 150, right: 150 },
                      children: [new Paragraph({ children: [new TextRun({ text: c.commentaire || '', font: 'Arial', size: 20, color: MUTED })] })]
                    })
                  ]
                });
              })
            ]
          }),

          spacer(), spacer(),
          divider(),

          // ─── BROUILLON ───
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Brouillon de réponse', font: 'Arial', size: 36, bold: true, color: DARK })] }),
          new Paragraph({ children: [new TextRun({ text: 'Sections générées par BidAI — à personnaliser avant envoi', font: 'Arial', size: 18, color: MUTED, italics: true })], spacing: { after: 300 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '1. Introduction', font: 'Arial', size: 26, bold: true, color: GREEN })] }),
          new Paragraph({ children: [new TextRun({ text: result.draft_intro || '', font: 'Arial', size: 22, color: DARK })], spacing: { after: 240 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '2. Méthodologie proposée', font: 'Arial', size: 26, bold: true, color: GREEN })] }),
          new Paragraph({ children: [new TextRun({ text: result.draft_methodo || '', font: 'Arial', size: 22, color: DARK })], spacing: { after: 240 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '3. Équipe projet', font: 'Arial', size: 26, bold: true, color: GREEN })] }),
          new Paragraph({ children: [new TextRun({ text: result.draft_equipe || '', font: 'Arial', size: 22, color: DARK })], spacing: { after: 240 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '4. Positionnement prix', font: 'Arial', size: 26, bold: true, color: GREEN })] }),
          new Paragraph({ children: [new TextRun({ text: result.conseil_prix || '', font: 'Arial', size: 22, color: DARK })], spacing: { after: 240 } }),

          spacer(),
          divider(),

          // ─── FOOTER ───
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Généré par ', font: 'Arial', size: 18, color: MUTED }),
              new TextRun({ text: 'BidAI', font: 'Arial', size: 18, bold: true, color: GREEN }),
              new TextRun({ text: '  —  bid-ai-sand.vercel.app  —  Document confidentiel', font: 'Arial', size: 18, color: MUTED })
            ]
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    const filename = `BidAI-Analyse-${(objet || 'AO').slice(0, 40).replace(/[^a-zA-Z0-9]/g, '-')}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);

  } catch (err) {
    console.error('Export error:', err.message);
    return res.status(500).json({ error: 'Erreur génération Word: ' + err.message });
  }
};
