// src/controllers/categoryController.js
import { supabase } from '../config/supabase.js';
import { categorySchema, validateRequest, validateUUID } from '../middleware/validation.js';

// GET all categories with hierarchy
export const getCategories = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      parent_id,
      is_active,
      include_products = false,
      sort_by = 'name',
      sort_order = 'asc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let selectQuery = `*, parent:parent_id (*)`;
    if (include_products === 'true') {
      selectQuery += `, products (*)`;
    }

    let query = supabase
      .from('categories')
      .select(selectQuery, { count: 'exact' });

    // Apply filters
    if (parent_id === 'null') {
      query = query.is('parent_id', null);
    } else if (parent_id) {
      query = query.eq('parent_id', parent_id);
    }
    
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const { data, error, count } = await query.range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Error fetching categories:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch categories' 
      });
    }

    // Build hierarchical structure
    const buildCategoryTree = (categories, parentId = null) => {
      return categories
        .filter(category => category.parent_id === parentId)
        .map(category => ({
          ...category,
          children: buildCategoryTree(categories, category.id)
        }));
    };

    const hierarchicalData = buildCategoryTree(data || []);

    res.json({
      success: true,
      data: hierarchicalData,
      flatData: data || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum)
      }
    });

  } catch (error) {
    console.error('Server error in getCategories:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// CREATE category
export const createCategory = [
  validateRequest(categorySchema),
  async (req, res) => {
    try {
      const { name, description, parent_id, is_active } = req.body;

      // Check if category name already exists
      const { data: existingCategory, error: checkError } = await supabase
        .from('categories')
        .select('id')
        .eq('name', name)
        .single();

      if (existingCategory) {
        return res.status(409).json({ 
          success: false, 
          error: 'Category name already exists' 
        });
      }

      // Verify parent category exists if provided
      if (parent_id) {
        const { data: parent, error: parentError } = await supabase
          .from('categories')
          .select('id')
          .eq('id', parent_id)
          .single();

        if (parentError || !parent) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid parent category' 
          });
        }
      }

      const { data, error } = await supabase
        .from('categories')
        .insert([{
          name,
          description: description || '',
          parent_id: parent_id || null,
          is_active: is_active !== false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select('*, parent:parent_id (*)');

      if (error) {
        console.error('Error creating category:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to create category' 
        });
      }

      res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in createCategory:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];

// UPDATE category
export const updateCategory = [
  validateUUID('id'),
  validateRequest(categorySchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, parent_id, is_active } = req.body;

      // Check if category exists
      const { data: existingCategory, error: checkError } = await supabase
        .from('categories')
        .select('id')
        .eq('id', id)
        .single();

      if (checkError || !existingCategory) {
        return res.status(404).json({ 
          success: false, 
          error: 'Category not found' 
        });
      }

      // Check for duplicate name (excluding current category)
      const { data: duplicateCategory, error: duplicateError } = await supabase
        .from('categories')
        .select('id')
        .eq('name', name)
        .neq('id', id)
        .single();

      if (duplicateCategory) {
        return res.status(409).json({ 
          success: false, 
          error: 'Category name already exists' 
        });
      }

      // Prevent circular reference
      if (parent_id === id) {
        return res.status(400).json({ 
          success: false, 
          error: 'Category cannot be its own parent' 
        });
      }

      const { data, error } = await supabase
        .from('categories')
        .update({
          name,
          description: description || '',
          parent_id: parent_id || null,
          is_active: is_active !== false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*, parent:parent_id (*)');

      if (error) {
        console.error('Error updating category:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update category' 
        });
      }

      res.json({
        success: true,
        message: 'Category updated successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in updateCategory:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];
