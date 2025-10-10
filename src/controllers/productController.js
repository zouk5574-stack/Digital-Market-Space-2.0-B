// src/controllers/productController.js (FINALISÉ)

import { supabase } from "../server.js";
import { addLog } from "./logController.js";

// ========================
// ✅ 1. CREATE product or service
// ========================
export async function createProduct(req, res) {
  try {
    const user = req.user.db;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { name, description, category, price, type, store_name, media_urls } = req.body;

    if (!name || !description || !category || !price || !type) {
      return res.status(400).json({ error: "Missing required fields (Name, description, category, price, type)" });
    }

    // Validation du prix
    if (parseFloat(price) <= 0) {
        return res.status(400).json({ error: "Price must be a positive number." });
    }

    // Vérifier que le vendeur n'a pas plus de 3 boutiques (si un store_name est fourni)
    if (store_name) {
      const { data: sellerProducts, error: countError } = await supabase
        .from("products")
        .select("distinct store_name", { count: "exact" })
        .eq("owner_id", user.id);

      if (countError) throw countError;
      const existingStores = new Set(sellerProducts.map(p => p.store_name).filter(Boolean));
      
      // Si le store_name n'existe pas déjà ET que le nombre max est atteint
      if (!existingStores.has(store_name) && existingStores.size >= 3) {
        return res.status(400).json({ error: "Maximum 3 stores per seller reached" });
      }
    }

    const { data: inserted, error } = await supabase
      .from("products")
      .insert([{
        owner_id: user.id, 
        name,
        description,
        category,
        price: parseFloat(price),
        type, 
        store_name: store_name || null,
        media_urls: media_urls || []
      }])
      .select()
      .single();

    if (error) throw error;
    
    await addLog(user.id, 'PRODUCT_CREATED', { product_id: inserted.id, type: inserted.type });

    return res.status(201).json({ message: "Product created ✅", product: inserted });
  } catch (err) {
    console.error("Create product error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ========================
// ✅ 2. GET all public products
// ========================
export async function listAllProducts(req, res) {
  try {
    const { data, error } = await supabase
      .from("products")
      // Jointure pour récupérer les infos de l'owner (via owner_id qui pointe vers users.id)
      .select("*, owner:owner_id(is_super_admin, username)") 
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Formatage pour l'affichage : identifier l'administrateur
    const formattedData = data.map(p => {
        const isOfficial = p.owner?.is_super_admin;
        return {
            ...p,
            seller_name: isOfficial ? "Official Marketplace" : p.owner?.username || "Seller",
            store_name: p.store_name || (isOfficial ? "Marketplace" : p.owner?.username || "Seller")
        };
    });

    return res.json(formattedData);
  } catch (err) {
    console.error("List products error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ========================
// ✅ 3. GET seller's own products
// ========================
export async function listMyProducts(req, res) {
  try {
    const user = req.user.db;
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("owner_id", user.id) 
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("List my products error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ========================
// ✅ 4. UPDATE product
// ========================
export async function updateProduct(req, res) {
  try {
    const user = req.user.db;
    const { id } = req.params;
    const { name, description, category, price, store_name, media_urls } = req.body;

    // 1. Check ownership
    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("owner_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: "Product not found" });
    if (existing.owner_id !== user.id && !user.is_super_admin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 2. Update
    const { data: updated, error } = await supabase
      .from("products")
      .update({ name, description, category, price: price ? parseFloat(price) : undefined, store_name, media_urls })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    
    await addLog(user.id, 'PRODUCT_UPDATED', { product_id: id });
    
    return res.json({ message: "Product updated ✅", product: updated });
  } catch (err) {
    console.error("Update product error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ========================
// ✅ 5. DELETE product
// ========================
export async function deleteProduct(req, res) {
  try {
    const user = req.user.db;
    const { id } = req.params;

    // 1. Check ownership
    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("owner_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: "Product not found" });
    if (existing.owner_id !== user.id && !user.is_super_admin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 2. Delete (RLS should handle cascade delete of order_items, product_files if configured)
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
    
    await addLog(user.id, 'PRODUCT_DELETED', { product_id: id });

    return res.json({ message: "Product deleted ✅" });
  } catch (err) {
    console.error("Delete product error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}
