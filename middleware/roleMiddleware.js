// middleware/roleMiddleware.js

export function isAdmin(req, res, next) {
  // admin by flag OR role string
  const isSuper = req.user?.is_super_admin || req.user?.db?.is_super_admin;
  const role = req.user?.db?.role;
  if (isSuper || role === "admin" || role === "administrator") {
    return next();
  }
  return res.status(403).json({ error: "Admin only" });
}

export function isSeller(req, res, next) {
  const isSuper = req.user?.is_super_admin || req.user?.db?.is_super_admin;
  const role = req.user?.db?.role;
  if (isSuper || role === "seller" || role === "vendor") {
    return next();
  }
  return res.status(403).json({ error: "Seller only" });
}

export function isBuyer(req, res, next) {
  const role = req.user?.db?.role;
  if (role === "buyer" || role === "client" || req.user?.db?.is_super_admin) {
    return next();
  }
  return res.status(403).json({ error: "Buyer only" });
}
