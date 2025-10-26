// src/controllers/orderController.js
import { orderSchema, validateRequest } from '../middleware/validation.js';

// Ajouter la validation
router.post('/', validateRequest(orderSchema), createOrder);

// Améliorer createOrder existante
export const createOrder = async (req, res) => {
  try {
    const { user_id, total_amount, status, shipping_address, items } = req.body;

    // Vérifier que l'utilisateur existe
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Vérifier les items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    // Vérifier la disponibilité des produits
    for (const item of items) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, name, stock_quantity, price')
        .eq('id', item.product_id)
        .single();

      if (productError || !product) {
        return res.status(404).json({ error: `Product not found: ${item.product_id}` });
      }

      if (product.stock_quantity < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for product: ${product.name}` 
        });
      }
    }

    // Créer la commande (votre logique existante améliorée)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        user_id,
        total_amount: parseFloat(total_amount),
        status: status || 'pending',
        shipping_address: typeof shipping_address === 'string' 
          ? shipping_address 
          : JSON.stringify(shipping_address),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (orderError) throw orderError;

    // Créer les order_items et mettre à jour le stock
    const orderItems = items.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Mettre à jour le stock des produits
    for (const item of items) {
      await supabase
        .from('products')
        .update({ 
          stock_quantity: supabase.sql`stock_quantity - ${item.quantity}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.product_id);
    }

    // Récupérer la commande complète
    const { data: completeOrder, error: fetchError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*, products (*, categories (*))),
        users (*)
      `)
      .eq('id', order.id)
      .single();

    if (fetchError) throw fetchError;

    res.status(201).json({
      success: true,
      data: completeOrder,
      message: 'Order created successfully'
    });

  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
};
