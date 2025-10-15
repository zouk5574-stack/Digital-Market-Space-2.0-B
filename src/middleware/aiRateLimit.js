// src/middleware/aiRateLimit.js
const rateLimitMap = new Map();

export function aiRateLimit(req, res, next) {
  const userId = req.user.db.id;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 10; // 10 requêtes par minute

  const userLimit = rateLimitMap.get(userId) || { count: 0, resetTime: now + windowMs };

  // Réinitialiser le compteur si la fenêtre de temps est écoulée
  if (now > userLimit.resetTime) {
    userLimit.count = 0;
    userLimit.resetTime = now + windowMs;
  }

  // Vérifier la limite
  if (userLimit.count >= maxRequests) {
    return res.status(429).json({
      error: "Trop de requêtes. Veuillez patienter avant de réessayer.",
      retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
    });
  }

  // Incrémenter le compteur
  userLimit.count++;
  rateLimitMap.set(userId, userLimit);

  // Ajouter les headers de rate limiting
  res.set({
    'X-RateLimit-Limit': maxRequests,
    'X-RateLimit-Remaining': maxRequests - userLimit.count,
    'X-RateLimit-Reset': userLimit.resetTime
  });

  next();
}
