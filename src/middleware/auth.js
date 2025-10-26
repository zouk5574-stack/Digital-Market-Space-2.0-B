import { supabase } from '../config/supabase.js';
import Joi from 'joi';

/**
 * Middleware d'authentification principal
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Token manquant',
        code: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Vérification token Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ 
        error: 'Token invalide ou expiré',
        code: 'INVALID_TOKEN'
      });
    }

    // Récupération données utilisateur
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select(`
        *,
        shops(id, name, slug, status, verification_status),
        wallets(id, balance, currency)
      `)
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ 
        error: 'Profil utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérification statut compte
    if (userData.status === 'suspended') {
      return res.status(403).json({ 
        error: 'Compte suspendu. Contactez le support.',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    if (userData.status === 'pending') {
      return res.status(403).json({ 
        error: 'Compte en attente de validation',
        code: 'ACCOUNT_PENDING'
      });
    }

    req.user = userData;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      error: 'Erreur d\'authentification',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Vérification des rôles
 */
export const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Permissions insuffisantes',
        required_roles: roles,
        user_role: req.user.role
      });
    }

    next();
  };
};

/**
 * Vérification de propriété
 */
export const requireOwnership = (resourceTable, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramName];
      const userId = req.user.id;

      const { data: resource, error } = await supabase
        .from(resourceTable)
        .select('user_id')
        .eq('id', resourceId)
        .single();

      if (error || !resource) {
        return res.status(404).json({ error: 'Ressource non trouvée' });
      }

      // Admins peuvent tout accéder
      if (req.user.role === 'admin') return next();

      // Vérification propriété
      if (resource.user_id !== userId) {
        return res.status(403).json({ 
          error: 'Accès refusé. Pas propriétaire.' 
        });
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({ error: 'Erreur vérification permissions' });
    }
  };
};

/**
 * Vérification vendeur avec boutique
 */
export const requireSeller = async (req, res, next) => {
  try {
    if (req.user.role !== 'seller') {
      return res.status(403).json({ error: 'Rôle vendeur requis' });
    }

    const { data: shop, error } = await supabase
      .from('shops')
      .select('id, status')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .single();

    if (error || !shop) {
      return res.status(403).json({ error: 'Boutique active requise' });
    }

    req.user.shop_id = shop.id;
    next();
  } catch (error) {
    console.error('Seller check error:', error);
    res.status(500).json({ error: 'Erreur vérification vendeur' });
  }
};

// Combinaisons prédéfinies
export const requireAuth = [authenticate];
export const requireAdmin = [authenticate, authorize(['admin'])];
export const requireSellerAuth = [authenticate, authorize(['seller']), requireSeller];
export const requireBuyer = [authenticate, authorize(['buyer'])];
