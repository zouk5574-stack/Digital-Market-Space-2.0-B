// src/controllers/productController.js
import { supabase } from '../config/supabase.js';
import { productSchema, validateRequest, validateUUID } from '../middleware/validation.js';

// GET all products with pagination, filters and relations
export const getProducts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category_id, 
      shop_id, 
      min_price, 
      max_price,
      search,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('products')
      .select(`
        *,
        categories (*),
        shops (*, users (*)),
        product_files (*)
      `, { count: 'exact' });

    // Apply filters
    if (category_id) query = query.eq('category_id', category_id);
    if (shop_id) query = query.eq('shop_id', shop_id);
    if (min_price) query = query.gte('price', parseFloat(min_price));
    if (max_price) query = query.lte('price', parseFloat(max_price));
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Only active products
    query = query.eq('is_active', true);

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const { data, error, count } = await query.range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Error fetching products:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch products' 
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
    console.error('Server error in getProducts:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// GET product by ID with complete relations
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories (*),
        shops (*, users (*)),
        product_files (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'Product not found' 
        });
      }
      console.error('Error fetching product:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch product' 
      });
    }

    if (!data) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Server error in getProductById:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// CREATE new product with validation
export const createProduct = [
  validateRequest(productSchema),
  async (req, res) => {
    try {
      const { 
        name, 
        price, 
        description, 
        category_id, 
        shop_id, 
        stock_quantity,
        is_active,
        tags 
      } = req.body;

      // Verify category exists
      const { data: category, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('id', category_id)
        .single();

      if (categoryError || !category) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid category' 
        });
      }

      // Verify shop exists and belongs to user
      const { data: shop, error: shopError } = await supabase
        .from('shops')
        .select('id, user_id')
        .eq('id', shop_id)
        .single();

      if (shopError || !shop) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid shop' 
        });
      }

      const { data, error } = await supabase
        .from('products')
        .insert([{
          name,
          price: parseFloat(price),
          description: description || '',
          category_id,
          shop_id,
          stock_quantity: parseInt(stock_quantity) || 0,
          is_active: is_active !== false,
          tags: tags || [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select(`
          *,
          categories (*),
          shops (*)
        `);

      if (error) {
        console.error('Error creating product:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to create product' 
        });
      }

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in createProduct:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];

// UPDATE product
export const updateProduct = [
  validateUUID('id'),
  validateRequest(productSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        name, 
        price, 
        description, 
        category_id, 
        shop_id, 
        stock_quantity,
        is_active,
        tags 
      } = req.body;

      // Check if product exists
      const { data: existingProduct, error: checkError } = await supabase
        .from('products')
        .select('id')
        .eq('id', id)
        .single();

      if (checkError || !existingProduct) {
        return res.status(404).json({ 
          success: false, 
          error: 'Product not found' 
        });
      }

      const { data, error } = await supabase
        .from('products')
        .update({
          name,
          price: parseFloat(price),
          description: description || '',
          category_id,
          shop_id,
          stock_quantity: parseInt(stock_quantity) || 0,
          is_active: is_active !== false,
          tags: tags || [],
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          categories (*),
          shops (*)
        `);

      if (error) {
        console.error('Error updating product:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update product' 
        });
      }

      res.json({
        success: true,
        message: 'Product updated successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in updateProduct:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];

// DELETE product (soft delete)
export const deleteProduct = [
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('products')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error deleting product:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to delete product' 
        });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Product not found' 
        });
      }

      res.json({
        success: true,
        message: 'Product deleted successfully'
      });

    } catch (error) {
      console.error('Server error in deleteProduct:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];
