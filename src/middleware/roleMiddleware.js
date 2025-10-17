// middleware/roleMiddleware.js
// Vérifie si l'utilisateur connecté possède le rôle requis
// Utilise req.user (attaché par authMiddleware)

export function requireRole(allowedRoles) {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.db) {
        return res.status(401).json({ error: "Authentification requise" });
      }

      // Cas spécial : super admin -> accès illimité
      if (req.user.is_super_admin) {
        return next();
      }

      // Vérifie le rôle (gère à la fois un seul rôle et un tableau de rôles)
      const userRole = req.user.db.role || req.user.role;
      
      // Convertir allowedRoles en tableau si c'est une string
      const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      
      // Vérifier si le rôle utilisateur est dans la liste des rôles autorisés
      if (!rolesArray.includes(userRole)) {
        return res.status(403).json({ 
          error: `Accès refusé : rôle ${rolesArray.join(' ou ')} requis` 
        });
      }

      return next();
    } catch (err) {
      console.error("requireRole error:", err);
      return res.status(500).json({ error: "Erreur lors de la vérification du rôle" });
    }
  };
}

// Vérifie si l'utilisateur est super admin
export function requireSuperAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.db) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé : super admin requis" });
    }

    return next();
  } catch (err) {
    console.error("requireSuperAdmin error:", err);
    return res.status(500).json({ error: "Erreur lors de la vérification du super admin" });
  }
}