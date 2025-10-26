// src/controllers/productController.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { productSchema, validateRequest } = require('../middleware/validation');

// GET all products with pagination and filters
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;
    const { category_id, shop_id, search } = req.query;

    let query = supabase
      .from('products')
      .select('*, categories(*), shops(*)', { count: 'exact' });

    if (category_id) query = query.eq('category_id', category_id);
    if (shop_id) query = query.eq('shop_id', shop_id);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error, count } = await query
      .eq('is_active', true)
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

// GET product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('products')
      .select('*, categories(*), shops(*, users(*))')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Product not found' });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE new product
router.post('/', validateRequest(productSchema), async (req, res) => {
  try {
    const { name, price, description, category_id, shop_id, stock_quantity } = req.body;

    const { data, error } = await supabase
      .from('products')
      .insert([{
        name,
        price,
        description,
        category_id,
        shop_id,
        stock_quantity: stock_quantity || 0,
        is_active: true,
        created_at: new Date()
      }])
      .select('*, categories(*), shops(*)');

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE product
router.put('/:id', validateRequest(productSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, category_id, shop_id, stock_quantity, is_active } = req.body;

    const { data, error } = await supabase
      .from('products')
      .update({
        name,
        price,
        description,
        category_id,
        shop_id,
        stock_quantity,
        is_active,
        updated_at: new Date()
      })
      .eq('id', id)
      .select('*, categories(*), shops(*)');

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('products')
      .update({ is_active: false, updated_at: new Date() })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
