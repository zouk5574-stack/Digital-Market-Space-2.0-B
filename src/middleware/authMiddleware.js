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

// Vérification JWT robuste
export const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Token d\'accès manquant', 401));
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next(new AppError('Token non fourni', 401));
    }

    // Vérification avec Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return next(new AppError('Token invalide ou expiré', 401));
    }

    // Récupération des données utilisateur public
    const { data: publicUser, error: publicError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (publicError) {
      console.error('Erreur récupération profil public:', publicError);
      return next(new AppError('Profil utilisateur non trouvé', 404));
    }

    // Construction de l'objet utilisateur complet
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      ...publicUser,
      auth_metadata: user
    };

    // Mise à jour du last_active
    await supabase
      .from('users')
      .update({ 
        last_active: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    next();
  } catch (error) {
    console.error('Erreur authentification:', error);
    next(new AppError('Erreur d\'authentification', 401));
  }
};

// Vérification des rôles
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentification requise', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Permissions insuffisantes', 403));
    }

    next();
  };
};

// Vérification de la propriété
export const checkOwnership = (tableName, idParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[idParam];
      const userId = req.user.id;

      if (!resourceId) {
        return next(new AppError('ID de ressource manquant', 400));
      }

      const { data: resource, error } = await supabase
        .from(tableName)
        .select('user_id')
        .eq('id', resourceId)
        .single();

      if (error) {
        return next(new AppError('Ressource non trouvée', 404));
      }

      if (resource.user_id !== userId) {
        return next(new AppError('Accès non autorisé à cette ressource', 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};