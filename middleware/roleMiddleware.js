// middleware/roleMiddleware.js

export const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Accès interdit : admin requis" });
};

export const isSeller = (req, res, next) => {
  if (req.user && req.user.role === "seller") {
    return next();
  }
  return res.status(403).json({ message: "Accès interdit : vendeur requis" });
};

export const isBuyer = (req, res, next) => {
  if (req.user && req.user.role === "buyer") {
    return next();
  }
  return res.status(403).json({ message: "Accès interdit : acheteur requis" });
};

export const isFreelance = (req, res, next) => {
  if (req.user && req.user.role === "freelance") {
    return next();
  }
  return res.status(403).json({ message: "Accès interdit : freelance requis" });
};
