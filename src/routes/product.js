// src/routes/product.js (Version Complétée et Sécurisée)

import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js"; // ⬅️ IMPORT CRITIQUE
import {
  createProduct,
  listAllProducts,
  listMyProducts,
  updateProduct,
  deleteProduct
} from "../controllers/productController.js";

const router = express.Router();

// ------------------------------------
// Public : Tout le monde peut voir les produits publics
// ------------------------------------
router.get("/", listAllProducts);

// ------------------------------------
// Sécurisé : Gestion du produit (Vendeur ou Admin requis)
// ------------------------------------

// Créer un produit : Seuls Vendeur/Admin peuvent créer
router.post("/", authenticateJWT, requireRole(["VENDEUR", "ADMIN"]), createProduct);

// Lister mes produits : Seuls Vendeur/Admin peuvent lister les leurs
router.get("/mine", authenticateJWT, requireRole(["VENDEUR", "ADMIN"]), listMyProducts);

// Mettre à jour un produit : Le Vendeur PROPRIÉTAIRE ou l'Admin
// La vérification de la propriété se fera dans le contrôleur (updateProduct)
router.put("/:id", authenticateJWT, requireRole(["VENDEUR", "ADMIN"]), updateProduct);

// Supprimer un produit : Le Vendeur PROPRIÉTAIRE ou l'Admin
// La vérification de la propriété se fera dans le contrôleur (deleteProduct)
router.delete("/:id", authenticateJWT, requireRole(["VENDEUR", "ADMIN"]), deleteProduct);

export default router;
