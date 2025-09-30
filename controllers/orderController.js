// controllers/orderController.js
import { supabase } from "../server.js";

const COMMISSION_RATE = 0.1; // 10% pour marketplace

// CREATE order
export async function createOrder(req, res) {
  try {
    const user = req.user.db;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { product_id, quantity } = req.body;
    if (!product_id || !quantity) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // Vérifier produit
    const { data: product, error: prodError } = await supabase
      .from("products")
      .select("*, users(id, username)")
      .eq("id", product_id)
      .single();

    if (prodError || !product) {
      return res.status(404).json({ error: "Product not found" });
    }
    if (product.seller_id === user.id) {
      return res.status(400).json({ error: "Cannot buy your own product" });
    }

    const total_price = product.price * quantity;
    const commission = total_price * COMMISSION_RATE;
    const seller_earning = total_price - commission;

    const { data: order, error } = await supabase
      .from("orders")
      .insert([{
        buyer_id: user.id,
        seller_id: product.seller_id,
        product_id,
        quantity,
        total_price,
        commission,
        seller_earning,
        status: "pending"
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ message: "Order created", order });
  } catch (err) {
    console.error("Create order error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// LIST my orders (buyer)
export async function listMyOrders(req, res) {
  try {
    const user = req.user.db;
    const { data, error } = await supabase
      .from("orders")
      .select("*, products(title,price), users:buyer_id(username)")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("List my orders error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// LIST my sales (seller)
export async function listMySales(req, res) {
  try {
    const user = req.user.db;
    const { data, error } = await supabase
      .from("orders")
      .select("*, products(title,price), users:buyer_id(username)")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("List my sales error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// UPDATE order status (admin or auto-validation)
export async function updateOrderStatus(req, res) {
  try {
    const user = req.user.db;
    const { id } = req.params;
    const { status } = req.body;

    if (!["paid", "delivered", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Vérifier commande
    const { data: existing, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: "Order not found" });

    // Seulement admin ou vendeur/buyer concerné
    if (
      existing.seller_id !== user.id &&
      existing.buyer_id !== user.id &&
      !user.is_super_admin
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data: updated, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ message: "Order updated", order: updated });
  } catch (err) {
    console.error("Update order error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// AUTO validate pending orders after 3 days
export async function autoValidateOrders() {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "delivered")
      .lt("updated_at", threeDaysAgo.toISOString());

    if (error) throw error;

    for (const order of orders) {
      await supabase.from("orders").update({ status: "completed" }).eq("id", order.id);
      console.log(`✅ Order ${order.id} auto-validated`);
    }
  } catch (err) {
    console.error("Auto validate orders error:", err);
  }
      }
