import { supabase } from '../config/supabase.js';
import Joi from 'joi';

const settingsValidation = {
  updateSettings: Joi.object({
    platform_name: Joi.string().max(100).optional(),
    platform_email: Joi.string().email().optional(),
    platform_currency: Joi.string().length(3).optional(),
    commission_rate: Joi.number().min(0).max(0.5).optional(),
    min_withdrawal_amount: Joi.number().min(1).optional(),
    max_withdrawal_amount: Joi.number().min(100).optional(),
    seller_verification_required: Joi.boolean().optional(),
    auto_approve_products: Joi.boolean().optional(),
    maintenance_mode: Joi.boolean().optional(),
    allowed_file_types: Joi.array().items(Joi.string()).optional(),
    max_file_size: Joi.number().min(1).max(100).optional(), // en MB
    seo_meta_title: Joi.string().max(255).optional(),
    seo_meta_description: Joi.string().max(500).optional(),
    social_media_links: Joi.object().optional(),
    contact_info: Joi.object().optional(),
    payment_methods: Joi.array().items(Joi.string()).optional(),
    tax_settings: Joi.object().optional()
  })
};

export const getPlatformSettings = async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('platform_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      throw error;
    }

    // Retourner les settings par défaut si aucun n'existe
    const defaultSettings = getDefaultSettings();
    const currentSettings = settings || defaultSettings;

    res.json({
      success: true,
      data: currentSettings
    });

  } catch (error) {
    console.error('Get platform settings error:', error);
    res.status(500).json({ error: 'Erreur récupération paramètres' });
  }
};

export const updatePlatformSettings = async (req, res) => {
  try {
    const { error, value } = settingsValidation.updateSettings.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    // Récupérer les settings actuels
    const { data: currentSettings, error: currentError } = await supabase
      .from('platform_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const settingsToUpdate = {
      ...(currentSettings || getDefaultSettings()),
      ...value,
      updated_by: req.user.id,
      updated_at: new Date().toISOString()
    };

    const { data: settings, error: updateError } = await supabase
      .from('platform_settings')
      .insert(settingsToUpdate)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log la modification
    await supabase
      .from('admin_logs')
      .insert({
        user_id: req.user.id,
        action: 'PLATFORM_SETTINGS_UPDATE',
        metadata: {
          updated_fields: Object.keys(value),
          previous_settings: currentSettings,
          new_settings: settings
        }
      });

    res.json({
      success: true,
      message: 'Paramètres mis à jour avec succès',
      data: settings
    });

  } catch (error) {
    console.error('Update platform settings error:', error);
    res.status(500).json({ error: 'Erreur mise à jour paramètres' });
  }
};

export const getPublicSettings = async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('platform_settings')
      .select(`
        platform_name,
        platform_email,
        platform_currency,
        commission_rate,
        min_withdrawal_amount,
        seller_verification_required,
        maintenance_mode,
        seo_meta_title,
        seo_meta_description,
        social_media_links,
        contact_info,
        payment_methods,
        allowed_file_types,
        max_file_size
      `)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const publicSettings = settings || getDefaultPublicSettings();

    res.json({
      success: true,
      data: publicSettings
    });

  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({ error: 'Erreur récupération paramètres publics' });
  }
};

// Fonctions utilitaires
const getDefaultSettings = () => ({
  platform_name: 'Digital Market Space',
  platform_email: 'contact@digitalmarketspace.com',
  platform_currency: 'XOF',
  commission_rate: 0.10,
  min_withdrawal_amount: 5000,
  max_withdrawal_amount: 1000000,
  seller_verification_required: true,
  auto_approve_products: false,
  maintenance_mode: false,
  allowed_file_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'],
  max_file_size: 10,
  seo_meta_title: 'Digital Market Space - Votre marketplace digitale',
  seo_meta_description: 'Marketplace digitale pour acheter et vendre des produits et services en ligne.',
  social_media_links: {},
  contact_info: {},
  payment_methods: ['fedapay', 'wallet'],
  tax_settings: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

const getDefaultPublicSettings = () => ({
  platform_name: 'Digital Market Space',
  platform_email: 'contact@digitalmarketspace.com',
  platform_currency: 'XOF',
  commission_rate: 0.10,
  min_withdrawal_amount: 5000,
  seller_verification_required: true,
  maintenance_mode: false,
  allowed_file_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'],
  max_file_size: 10,
  seo_meta_title: 'Digital Market Space - Votre marketplace digitale',
  seo_meta_description: 'Marketplace digitale pour acheter et vendre des produits et services en ligne.',
  social_media_links: {},
  contact_info: {},
  payment_methods: ['fedapay', 'wallet']
});
