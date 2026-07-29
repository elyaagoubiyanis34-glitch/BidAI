const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXPEDITEUR = 'BidRay <contact@getbidray.com>';

const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bienvenue sur BidRay</title>
</head>
<body style="margin:0;padding:0;background:#FDFBF5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDFBF5;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding-bottom:28px">
              <img src="https://getbidray.com/logo-email.png" width="123" height="53" alt="BidRay"
                   style="display:block;border:0;outline:none;text-decoration:none;margin:0 auto">
            </td>
          </tr>

          <!-- CARD -->
          <tr>
            <td style="background:#FFFFFF;border-radius:10px;overflow:hidden;box-shadow:5px 5px 0 rgba(21,21,16,.07)">

              <!-- TOP BAR -->
              <div style="height:4px;background:#0BBF6A"></div>

              <!-- HERO -->
              <div style="background:#E7F8EF;padding:32px 40px 28px;border-bottom:1px solid #E4E0D4">
                <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#151510;letter-spacing:-.5px;line-height:1.2">
                  Votre compte est actif 🎉
                </h1>
                <p style="margin:0;font-size:15px;color:#067A43;font-weight:400">
                  Bienvenue sur BidRay — l'assistant qui décode vos appels d'offres et pilote vos dossiers.
                </p>
              </div>

              <!-- CONTENT -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:36px 40px">
                <tr>
                  <td>

                    <p style="margin:0 0 24px;font-size:15px;color:#6E6C60;line-height:1.7;font-weight:400">
                      Vous disposez d'<strong style="color:#151510;font-weight:600">1 analyse offerte</strong> pour juger sur pièce. Voici comment démarrer :
                    </p>

                    <!-- Steps -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #FDFBF5">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width:32px;height:32px;background:#151510;border-radius:8px;text-align:center;vertical-align:middle;font-size:14px;font-weight:700;color:#0BBF6A">1</td>
                              <td style="padding-left:14px">
                                <div style="font-size:14px;font-weight:600;color:#151510">Accédez à votre dashboard</div>
                                <div style="font-size:13px;color:#9B998D;margin-top:2px">Connectez-vous avec votre email et mot de passe</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #FDFBF5">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width:32px;height:32px;background:#151510;border-radius:8px;text-align:center;vertical-align:middle;font-size:14px;font-weight:700;color:#0BBF6A">2</td>
                              <td style="padding-left:14px">
                                <div style="font-size:14px;font-weight:600;color:#151510">Déposez votre DCE</div>
                                <div style="font-size:13px;color:#9B998D;margin-top:2px">PDF ou Word — l'extraction reste dans votre navigateur</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width:32px;height:32px;background:#151510;border-radius:8px;text-align:center;vertical-align:middle;font-size:14px;font-weight:700;color:#0BBF6A">3</td>
                              <td style="padding-left:14px">
                                <div style="font-size:14px;font-weight:600;color:#151510">Décidez en deux minutes</div>
                                <div style="font-size:13px;color:#9B998D;margin-top:2px">Critères pondérés, attentes implicites, clauses à risque</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table cellpadding="0" cellspacing="0" style="margin-bottom:32px">
                      <tr>
                        <td style="background:#0BBF6A;border-radius:6px;box-shadow:0 3px 0 #067A43">
                          <a href="https://getbidray.com/app/dashboard.html" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#04250F;text-decoration:none">
                            Accéder à mon dashboard →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <div style="border-top:1px solid #EEEBE4;margin-bottom:24px"></div>

                    <p style="margin:0;font-size:14px;color:#6E6C60;line-height:1.65;font-weight:400">
                      Une question ? Répondez directement à cet email — je réponds personnellement sous 24h.
                    </p>
                    <p style="margin:12px 0 0;font-size:14px;color:#151510;font-weight:500">
                      À très vite,<br>
                      <span style="color:#0BBF6A">L'équipe BidRay</span>
                    </p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding-top:24px">
              <p style="margin:0 0 6px;font-size:12px;color:#9B998D">
                Vous recevez cet email car vous venez de créer un compte BidRay.
              </p>
              <p style="margin:0;font-size:12px;color:#9B998D">
                © 2026 BidRay · <a href="mailto:contact@getbidray.com" style="color:#9B998D">contact@getbidray.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Authentification : seul le titulaire du compte déclenche son propre email ──
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise' });
  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Session expirée' });

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY absente des variables d\'environnement' });
  }

  try {
    // ── Un seul envoi par compte ──
    const { data: profil } = await sb.from('profiles')
      .select('welcome_sent').eq('id', user.id).maybeSingle();
    if (profil?.welcome_sent) {
      return res.status(200).json({ deja_envoye: true });
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: [user.email],
        reply_to: 'contact@getbidray.com',
        subject: 'Bienvenue sur BidRay — votre analyse offerte vous attend',
        html: HTML
      })
    });

    const reponse = await r.json();

    if (!r.ok) {
      // 403 typique : le domaine n'est pas encore vérifié chez Resend
      return res.status(502).json({
        error: reponse.message || "L'envoi a échoué",
        detail: reponse
      });
    }

    // marque le compte pour ne pas renvoyer l'email
    await sb.from('profiles').update({ welcome_sent: true }).eq('id', user.id);

    return res.status(200).json({ envoye: true, id: reponse.id });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
