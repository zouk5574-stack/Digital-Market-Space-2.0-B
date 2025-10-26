// src/controllers/productController.js
import { productSchema, validateRequest } from '../middleware/validation.js';

// Ajouter la validation aux routes existantes
router.post('/', validateRequest(productSchema), createProduct);
router.put('/:id', validateRequest(productSchema), updateProduct);

// Améliorer la fonction createProduct existante
export const createProduct = async (req, res) => {
  try {
    const { 
      name, 
      price, 
      description, 
      category_id, 
      shop_id, 
      stock_quantity,
      is_active 
    } = req.body;

    // Vérifier que la boutique appartient à l'utilisateur
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('user_id')
      .eq('id', shop_id)
      .single();

    if (shopError || !shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Vérifier que la catégorie existe
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', category_id)
      .single();

    if (categoryError || !category) {
      return res.status(404).json({ error: 'Category not found' });
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select(`
        *,
        categories (*),
        shops (*)
      `);

    if (error) {
      console.error('Product creation error:', error);
      return res.status(500).json({ error: 'Failed to create product' });
    }

    res.status(201).json({
      success: true,
      data: data[0],
      message: 'Product created successfully'
    });

  } catch (error) {
    console.error('Server error in createProduct:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
