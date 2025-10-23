// src/controllers/platformSettingsController.js
import { supabase } from '../config/supabaseClient.js';
import { logEvent } from './logController.js';

// ===============================
// GET /admin/settings
// ===============================
export const getSettings = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ message: 'Aucun paramètre trouvé.' });
    }

    await logEvent('Consultation des paramètres plateforme', req.user?.email);
    res.json({
      platformName: data.platform_name,
      currency: data.currency,
      commissionRate: data.commission_rate,
    });
  } catch (err) {
    console.error('Erreur getSettings:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des paramètres.' });
  }
};

// ===============================
// PUT /admin/settings
// ===============================
export const updateSettings = async (req, res) => {
  try {
    const { platformName, currency, defaultCommission } = req.body;

    if (!platformName || !currency)
      return res.status(400).json({ message: 'Nom et devise requis.' });

    if (defaultCommission < 0 || defaultCommission > 100)
      return res.status(400).json({ message: 'Commission invalide (0-100%).' });

    const { data, error } = await supabase
      .from('platform_settings')
      .update({
        platform_name: platformName,
        currency,
        commission_rate: defaultCommission,
        updated_at: new Date(),
      })
      .order('updated_at', { ascending: false })
      .limit(1)
      .select()
      .maybeSingle();

    if (error) throw error;

    await logEvent('Mise à jour paramètres plateforme', req.user?.email, data);

    res.json({
      message: 'Paramètres mis à jour avec succès',
      settings: {
        platformName: data.platform_name,
        currency: data.currency,
        commissionRate: data.commission_rate,
      },
    });
  } catch (err) {
    console.error('Erreur updateSettings:', err);
    res.status(500).json({ message: 'Erreur lors de la mise à jour des paramètres.' });
  }
};