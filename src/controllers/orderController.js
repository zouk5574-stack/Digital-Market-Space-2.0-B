// src/controllers/orderController.js
import { supabase } from '../config/supabase.js';
import { orderSchema, validateRequest, validateUUID } from '../middleware/validation.js';

// GET all orders with pagination and filters
export const getOrders = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      user_id, 
      status, 
      start_date, 
      end_date,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (*, products (*, categories (*), shops (*))),
        users (*),
        transactions (*)
      `, { count: 'exact' });

    // Apply filters
    if (user_id) query = query.eq('user_id', user_id);
    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const { data, error, count } = await query.range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Error fetching orders:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch orders' 
      });
    }

    res.json({
      success: true,
      data: data || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum)
      }
    });

  } catch (error) {
    console.error('Server error in getOrders:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// GET order by ID with complete relations
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*, products (*, categories (*), shops (*))),
        users (*),
        transactions (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'Order not found' 
        });
      }
      console.error('Error fetching order:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch order' 
      });
    }

    if (!data) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Server error in getOrderById:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// CREATE new order with transaction
export const createOrder = [
  validateRequest(orderSchema),
  async (req, res) => {
    try {
      const { user_id, total_amount, status, shipping_address, items } = req.body;

      // Verify user exists
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user_id)
        .single();

      if (userError || !user) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid user' 
        });
      }

      // Verify products and stock
      for (const item of items) {
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('id, name, stock_quantity, price, is_active')
          .eq('id', item.product_id)
          .single();

        if (productError || !product) {
          return res.status(400).json({ 
            success: false, 
            error: `Product not found: ${item.product_id}` 
          });
        }

        if (!product.is_active) {
          return res.status(400).json({ 
            success: false, 
            error: `Product not available: ${product.name}` 
          });
        }

        if (product.stock_quantity < item.quantity) {
          return res.status(400).json({ 
            success: false, 
            error: `Insufficient stock for: ${product.name}` 
          });
        }
      }

      // Create order
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

      // Create order items
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

      // Update product stock
      for (const item of items) {
        const { error: stockError } = await supabase
          .from('products')
          .update({ 
            stock_quantity: supabase.sql`stock_quantity - ${item.quantity}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.product_id);

        if (stockError) throw stockError;
      }

      // Get complete order with relations
      const { data: completeOrder, error: fetchError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*, products (*, categories (*), shops (*))),
          users (*)
        `)
        .eq('id', order.id)
        .single();

      if (fetchError) throw fetchError;

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: completeOrder
      });

    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create order' 
      });
    }
  }
];

// UPDATE order status
export const updateOrderStatus = [
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ 
          success: false, 
          error: 'Status is required' 
        });
      }

      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid status' 
        });
      }

      const { data, error } = await supabase
        .from('orders')
        .update({ 
          status, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error updating order status:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update order status' 
        });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Order not found' 
        });
      }

      res.json({
        success: true,
        message: 'Order status updated successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in updateOrderStatus:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];
