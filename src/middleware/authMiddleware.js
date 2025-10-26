const { supabase } = require('../config/supabase');

// Vérification des rôles multiples
exports.authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Accès refusé. Permissions insuffisantes.',
        required_roles: roles,
        user_role: req.user.role
      });
    }

    next();
  };
};

// Vérification de propriété
exports.requireOwnership = (resourceTable, paramName = 'id') => {
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

      // Admins peuvent accéder à tout
      if (req.user.role === 'admin') {
        return next();
      }

      // Vérifier la propriété
      if (resource.user_id !== userId) {
        return res.status(403).json({ 
          error: 'Accès refusé. Vous n\'êtes pas propriétaire de cette ressource.' 
        });
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({ error: 'Erreur de vérification des permissions' });
    }
  };
};
