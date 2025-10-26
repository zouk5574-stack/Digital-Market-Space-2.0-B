// src/controllers/orderController.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { orderSchema, validateRequest } = require('../middleware/validation');

// GET all orders with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { user_id, status } = req.query;

    let query = supabase
      .from('orders')
      .select('*, order_items(*, products(*)), users(*)', { count: 'exact' });

    if (user_id) query = query.eq('user_id', user_id);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET order by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*, categories(*))), users(*), transactions(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Order not found' });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE new order
router.post('/', validateRequest(orderSchema), async (req, res) => {
  try {
    const { user_id, total_amount, status, shipping_address, items } = req.body;

    // Créer la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        user_id,
        total_amount,
        status,
        shipping_address,
        created_at: new Date()
      }])
      .select()
      .single();

    if (orderError) throw orderError;

    // Ajouter les items de commande
    if (items && items.length > 0) {
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
    }

    // Récupérer la commande complète
    const { data: completeOrder, error: fetchError } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .eq('id', order.id)
      .single();

    if (fetchError) throw fetchError;

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: completeOrder
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date() })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
