// controllers/productController.js
import { supabase } from "../server.js";

// CREATE product or service
export async function createProduct(req, res) {
  try {
    const user = req.user.db;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { title, description, category, price, type, store_name, media_urls } = req.body;

    if (!title || !description || !category || !price || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Vérifier que le vendeur n'a pas plus de 3 boutiques
    if (store_name) {
      const { data: sellerProducts, error: countError } = await supabase
        .from("products")
        .select("distinct store_name", { count: "exact" })
        .eq("seller_id", user.id);

      if (countError) throw countError;
      const existingStores = new Set(sellerProducts.map(p => p.store_name).filter(Boolean));
      if (!existingStores.has(store_name) && existingStores.size >= 3) {
        return res.status(400).json({ error: "Maximum 3 stores per seller reached" });
      }
    }

    const { data: inserted, error } = await supabase
      .from("products")
      .insert([{
        seller_id: user.id,
        title,
        description,
        category,
        price,
        type, // "digital" or "freelance"
        store_name: store_name || null,
        media_urls: media_urls || []
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ message: "Product created", product: inserted });
  } catch (err) {
    console.error("Create product error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// GET all public products (buyers can see everything)
export async function listAllProducts(req, res) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*, users(is_super_admin,username,store_name)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Admin products anonymized & placed first
    const adminProducts = [];
    const normalProducts = [];

    data.forEach(p => {
      if (p.users?.is_super_admin) {
        adminProducts.push({
          ...p,
          seller: "Official Store",
          store_name: p.store_name || "Marketplace"
        });
      } else {
        normalProducts.push({
          ...p,
          seller: p.users?.username || "Seller",
          store_name: p.store_name
        });
      }
    });

    return res.json([...adminProducts, ...normalProducts]);
  } catch (err) {
    console.error("List products error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// GET seller's own products
export async function listMyProducts(req, res) {
  try {
    const user = req.user.db;
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("List my products error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// UPDATE product
export async function updateProduct(req, res) {
  try {
    const user = req.user.db;
    const { id } = req.params;
    const { title, description, category, price, store_name, media_urls } = req.body;

    // Check ownership
    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: "Product not found" });
    if (existing.seller_id !== user.id && !user.is_super_admin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data: updated, error } = await supabase
      .from("products")
      .update({ title, description, category, price, store_name, media_urls })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ message: "Product updated", product: updated });
  } catch (err) {
    console.error("Update product error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// DELETE product
export async function deleteProduct(req, res) {
  try {
    const user = req.user.db;
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: "Product not found" });
    if (existing.seller_id !== user.id && !user.is_super_admin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;

    return res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("Delete product error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}
