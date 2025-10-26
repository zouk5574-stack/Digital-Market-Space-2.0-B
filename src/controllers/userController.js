// src/controllers/userController.js
import { supabase } from '../config/supabase.js';
import { userSchema, validateRequest, validateUUID } from '../middleware/validation.js';

// GET all users with pagination
export const getUsers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search,
      role,
      is_active,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('users')
      .select(`
        *,
        shops (*),
        wallets (*)
      `, { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }
    if (role) query = query.eq('role', role);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const { data, error, count } = await query.range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch users' 
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
    console.error('Server error in getUsers:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// GET user by ID with complete profile
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        shops (*),
        wallets (*),
        user_payout_accounts (*),
        orders (*, order_items (*, products (*))),
        freelance_missions!freelance_missions_client_id_fkey (*),
        freelance_missions!freelance_missions_freelance_id_fkey (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      console.error('Error fetching user:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch user' 
      });
    }

    if (!data) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Server error in getUserById:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// CREATE user profile
export const createUser = [
  validateRequest(userSchema),
  async (req, res) => {
    try {
      const { 
        username, 
        email, 
        first_name, 
        last_name, 
        phone, 
        avatar_url 
      } = req.body;

      // Check if username already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .or(`username.eq.${username},email.eq.${email}`)
        .single();

      if (existingUser) {
        return res.status(409).json({ 
          success: false, 
          error: 'Username or email already exists' 
        });
      }

      const { data, error } = await supabase
        .from('users')
        .insert([{
          username,
          email,
          first_name: first_name || '',
          last_name: last_name || '',
          phone: phone || '',
          avatar_url: avatar_url || '',
          is_active: true,
          role: 'user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select();

      if (error) {
        console.error('Error creating user:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to create user' 
        });
      }

      // Create wallet for the user
      await supabase
        .from('wallets')
        .insert([{
          user_id: data[0].id,
          balance: 0,
          currency: 'XOF',
          created_at: new Date().toISOString()
        }]);

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in createUser:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];

// UPDATE user profile
export const updateUser = [
  validateUUID('id'),
  validateRequest(userSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        username, 
        email, 
        first_name, 
        last_name, 
        phone, 
        avatar_url 
      } = req.body;

      // Check if user exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('id', id)
        .single();

      if (checkError || !existingUser) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }

      // Check for duplicate username/email (excluding current user)
      const { data: duplicateUser, error: duplicateError } = await supabase
        .from('users')
        .select('id')
        .or(`username.eq.${username},email.eq.${email}`)
        .neq('id', id)
        .single();

      if (duplicateUser) {
        return res.status(409).json({ 
          success: false, 
          error: 'Username or email already exists' 
        });
      }

      const { data, error } = await supabase
        .from('users')
        .update({
          username,
          email,
          first_name: first_name || '',
          last_name: last_name || '',
          phone: phone || '',
          avatar_url: avatar_url || '',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error updating user:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update user' 
        });
      }

      res.json({
        success: true,
        message: 'User updated successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in updateUser:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];

// DELETE user (soft delete)
export const deleteUser = [
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('users')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error deleting user:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to delete user' 
        });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }

      res.json({
        success: true,
        message: 'User deleted successfully'
      });

    } catch (error) {
      console.error('Server error in deleteUser:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];
