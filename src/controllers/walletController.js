// src/controllers/walletController.js
import { supabase } from '../config/supabase.js';
import { walletSchema, validateRequest, validateUUID } from '../middleware/validation.js';

// GET wallet by user ID
export const getWalletByUserId = async (req, res) => {
  try {
    const { user_id } = req.params;

    const { data, error } = await supabase
      .from('wallets')
      .select(`
        *,
        users (*),
        transactions!transactions_wallet_id_fkey (*),
        withdrawals (*)
      `)
      .eq('user_id', user_id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'Wallet not found' 
        });
      }
      console.error('Error fetching wallet:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch wallet' 
      });
    }

    if (!data) {
      return res.status(404).json({ 
        success: false, 
        error: 'Wallet not found' 
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Server error in getWalletByUserId:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// CREATE wallet for user
export const createWallet = [
  validateRequest(walletSchema),
  async (req, res) => {
    try {
      const { user_id, balance, currency } = req.body;

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

      // Check if wallet already exists for user
      const { data: existingWallet, error: checkError } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', user_id)
        .single();

      if (existingWallet) {
        return res.status(409).json({ 
          success: false, 
          error: 'Wallet already exists for this user' 
        });
      }

      const { data, error } = await supabase
        .from('wallets')
        .insert([{
          user_id,
          balance: parseFloat(balance) || 0,
          currency: currency || 'XOF',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select(`
          *,
          users (*)
        `);

      if (error) {
        console.error('Error creating wallet:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to create wallet' 
        });
      }

      res.status(201).json({
        success: true,
        message: 'Wallet created successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in createWallet:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];

// UPDATE wallet balance
export const updateWalletBalance = [
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, operation } = req.body; // operation: 'add' or 'subtract'

      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Valid amount is required' 
        });
      }

      if (!['add', 'subtract'].includes(operation)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Operation must be "add" or "subtract"' 
        });
      }

      // Get current wallet
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance, user_id')
        .eq('id', id)
        .single();

      if (walletError || !wallet) {
        return res.status(404).json({ 
          success: false, 
          error: 'Wallet not found' 
        });
      }

      let newBalance;
      if (operation === 'add') {
        newBalance = wallet.balance + parseFloat(amount);
      } else {
        newBalance = wallet.balance - parseFloat(amount);
        if (newBalance < 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'Insufficient balance' 
          });
        }
      }

      const { data, error } = await supabase
        .from('wallets')
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          users (*)
        `);

      if (error) {
        console.error('Error updating wallet:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update wallet' 
        });
      }

      // Create transaction record
      await supabase
        .from('transactions')
        .insert([{
          user_id: wallet.user_id,
          wallet_id: id,
          amount: parseFloat(amount),
          type: operation === 'add' ? 'credit' : 'debit',
          status: 'completed',
          description: `Wallet ${operation === 'add' ? 'credit' : 'debit'}`,
          created_at: new Date().toISOString()
        }]);

      res.json({
        success: true,
        message: `Wallet ${operation === 'add' ? 'credited' : 'debited'} successfully`,
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in updateWalletBalance:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];

// GET wallet transactions
export const getWalletTransactions = async (req, res) => {
  try {
    const { wallet_id } = req.params;
    const { 
      page = 1, 
      limit = 20,
      type,
      start_date,
      end_date,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('wallet_id', wallet_id);

    // Apply filters
    if (type) query = query.eq('type', type);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const { data, error, count } = await query.range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Error fetching transactions:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch transactions' 
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
    console.error('Server error in getWalletTransactions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};
