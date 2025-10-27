import jwt from 'jsonwebtoken';
import { supabase } from '../config/database.js';

export class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Vérification JWT sécurisée
export const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token manquant ou format invalide', 401);
    }

    const token = authHeader.split(' ')[1];
    
    // Vérification robuste du JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'digital-market-space',
      issuer: 'digital-market-space-api'
    });

    // Récupération de l'utilisateur depuis Supabase
    const { data: authUser, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authUser.user) {
      throw new AppError('Utilisateur non authentifié', 401);
    }

    // Récupération des données utilisateur public
    const { data: publicUser, error: publicError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.user.id)
      .single();

    if (publicError) {
      console.error('Erreur récupération user public:', publicError);
      throw new AppError('Profil utilisateur non trouvé', 404);
    }

    // Fusion des données utilisateur
    req.user = {
      ...authUser.user,
      ...publicUser,
      auth: authUser.user,
      profile: publicUser
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Token JWT invalide', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token JWT expiré', 401));
    }
    next(error);
  }
};

// Vérification de l'ownership
export const checkOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const userId = req.user.id;

      let query;
      switch (resourceType) {
        case 'mission':
          query = supabase.from('missions').select('user_id').eq('id', resourceId).single();
          break;
        case 'order':
          query = supabase.from('orders').select('buyer_id, freelancer_id').eq('id', resourceId).single();
          break;
        case 'wallet':
          query = supabase.from('wallets').select('user_id').eq('id', resourceId).single();
          break;
        default:
          return next(new AppError('Type de ressource non supporté', 400));
      }

      const { data: resource, error } = await query;

      if (error) {
        return next(new AppError('Ressource non trouvée', 404));
      }

      // Vérification selon le type de ressource
      const isOwner = 
        resourceType === 'order' 
          ? resource.buyer_id === userId || resource.freelancer_id === userId
          : resource.user_id === userId;

      if (!isOwner) {
        return next(new AppError('Accès non autorisé à cette ressource', 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};