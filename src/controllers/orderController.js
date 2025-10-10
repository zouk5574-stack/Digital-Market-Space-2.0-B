// src/controllers/orderController.js (FINALISÉ)

import { supabase } from "../server.js";
import { addNotification } from "./notificationController.js";
import { addLog } from "./logController.js";

// ⚠️ Le calcul de la commission est maintenant dans fedapayController (webhook)
// Le taux reste ici pour la traçabilité si nécessaire, mais n'est pas utilisé dans createOrder.
const COMMISSION_RATE = 0.10; 

// ========================
// 🛒 1. Créer une Commande (pour produits, non services)
// ========================
export async function createOrder(req, res) {
  try {
    const user = req.user.db;
    const { product_id, quantity } = req.body; // Un seul produit par appel pour simplifier l'exemple

    if (!product_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: "Product ID and valid quantity are required" });
    }

    // 1. Vérifier produit et propriétaire
    const { data: product, error: prodError } = await supabase
      .from("products")
      .select("id, title, price, user_id")
      .eq("id", product_id)
      .single();

    if (prodError || !product) {
      return res.status(404).json({ error: "Product not found" });
    }
    if (product.user_id === user.id) {
      return res.status(400).json({ error: "Cannot buy your own product" });
    }

    const total_price = product.price * quantity;

    // 2. Créer l'enregistrement de la commande (status: pending_payment)
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{
        buyer_id: user.id,
        seller_id: product.user_id, // ⬅️ L'ID du vendeur est user_id sur la table products
        total_price: total_price,
        status: "pending_payment" // ⬅️ Statut initial
      }])
      .select()
      .single();

    if (orderError) throw orderError;
    
    // 3. Créer les articles de commande (pour la modularité)
    const { error: itemError } = await supabase
        .from("order_items")
        .insert([{
            order_id: order.id,
            product_id: product.id,
            seller_id: product.user_id, // Redondance pour faciliter les requêtes
            quantity: quantity,
            price: product.price, // Prix unitaire au moment de l'achat
        }]);
        
    if (itemError) {
        // Rétrograder la commande si l'article échoue (Best effort)
        await supabase.from("orders").delete().eq("id", order.id).catch(e => console.error("Rollback failed:", e));
        throw itemError;
    }

    await addLog(user.id, 'ORDER_INITIATED', { order_id: order.id, total_price });

    // 4. Notification au vendeur de la nouvelle commande en attente
    await addNotification(product.user_id, "Nouvelle Commande", `La commande #${order.id} est en attente de paiement.`, 'info', order.id);


    return res.status(201).json({ 
        message: "Order created successfully. Pending payment.", 
        order: { ...order, order_items: [{ product_id, quantity, price: product.price }] } 
    });
  } catch (err) {
    console.error("Create order error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ========================
// 🔎 2. LIST my orders (buyer)
// ========================
export async function listMyOrders(req, res) {
  try {
    const user = req.user.db;
    const { data, error } = await supabase
      .from("orders")
      // Jointure avec les articles pour voir ce qui a été acheté
      .select("*, order_items(*, products(title))") 
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("List my orders error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
}

// ========================
// 💰 3. LIST my sales (seller)
// ========================
export async function listMySales(req, res) {
  try {
    const user = req.user.db;
    const { data, error } = await supabase
      .from("orders")
      // Jointure avec les articles pour voir ce qui a été vendu
      .select("*, order_items(*, products(title)), buyer:buyer_id(username)") 
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("List my sales error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
}

// ========================
// ⚙️ 4. UPDATE order status (admin or seller/buyer for specific status)
// ========================
export async function updateOrderStatus(req, res) {
  try {
    const user = req.user.db;
    const { id } = req.params;
    const { status } = req.body;

    // Statuts possibles et qui peut les changer
    const validTransitions = {
        "delivered": existing => existing.seller_id === user.id || user.is_super_admin, // Seller marque livré
        "validated": existing => existing.buyer_id === user.id || user.is_super_admin, // Buyer valide la livraison
        "cancelled": existing => (existing.buyer_id === user.id || existing.seller_id === user.id) && existing.status === 'pending_payment', // Annulation avant paiement
        "refunded": existing => user.is_super_admin, // Admin seulement
        "completed": existing => user.is_super_admin, // Admin seulement (complétion auto gérée par fedapay webhook ou autoValidate)
    };
    
    if (!validTransitions.hasOwnProperty(status)) {
      return res.status(400).json({ error: "Invalid status or transition" });
    }

    // 1. Vérifier commande
    const { data: existing, error: fetchError } = await supabase
      .from("orders")
      .select("id, seller_id, buyer_id, status, total_price")
      .eq("id", id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: "Order not found" });

    // 2. Vérification d'autorisation (basée sur la transition)
    if (!validTransitions[status](existing)) {
        return res.status(403).json({ error: "Forbidden: You are not authorized to set this status." });
    }
    
    // 3. Application de la mise à jour
    const { data: updated, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    
    await addLog(user.id, `ORDER_STATUS_UPDATED_${status.toUpperCase()}`, { order_id: id, old_status: existing.status, new_status: status });
    await addNotification(existing.buyer_id, `Commande #${id} mise à jour`, `Le statut de votre commande est passé à ${status}.`, 'info', id);


    // 4. Logique post-transition critique (à noter)
    if (status === 'validated' || status === 'completed') {
        // ⚠️ CRITIQUE : Le paiement au vendeur est géré par le Webhook Fedapay ou une autre fonction de paiement
        // Pour les services, le paiement est géré par freelanceController.validateDelivery.
        // On ne fait rien ici pour éviter les doubles paiements.
    }

    return res.json({ message: `Order status set to ${status} ✅`, order: updated });
  } catch (err) {
    console.error("Update order error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
}


// ========================
// 🕒 5. Tâche Cron : AUTO validate delivered orders after X days
// ========================
export async function autoValidateOrders() {
  try {
    const AUTO_VALIDATE_DAYS = 7; // Délai standard pour la validation auto
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - AUTO_VALIDATE_DAYS);

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, total_price, seller_id, buyer_id")
      .eq("status", "delivered") // Uniquement les commandes qui ont été livrées
      .lt("updated_at", targetDate.toISOString()); // Non mises à jour depuis X jours

    if (error) throw error;

    for (const order of orders) {
      // ⚠️ NOTE : Dans un système réel, cette auto-validation doit AUSSI déclencher la logique
      // de libération des fonds vers le vendeur, de la même manière que validateDelivery.
      // Pour cet exercice, nous mettons uniquement à jour le statut.
      await supabase.from("orders").update({ status: "completed" }).eq("id", order.id);
      
      // Notification
      await addNotification(order.buyer_id, "Commande validée auto", `La commande #${order.id} a été marquée 'terminée' automatiquement.`, 'success', order.id);

      console.log(`✅ Order ${order.id} auto-validated`);
    }
  } catch (err) {
    console.error("Auto validate orders error:", err);
  }
}
