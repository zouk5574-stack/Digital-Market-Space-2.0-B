// src/controllers/withdrawalController.js
import { supabase } from '../config/supabase.js';
import { withdrawalSchema, validateRequest, validateUUID } from '../middleware/validation.js';

// CREATE withdrawal request
export const createWithdrawal = [
  validateRequest(withdrawalSchema),
  async (req, res) => {
    try {
      const { user_id, amount, payment_method, status } = req.body;

      // Verify user exists and has wallet
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance, id')
        .eq('user_id', user_id)
        .single();

      if (walletError || !wallet) {
        return res.status(400).json({ 
          success: false, 
          error: 'User wallet not found' 
        });
      }

      // Check sufficient balance
      if (wallet.balance < amount) {
        return res.status(400).json({ 
          success: false, 
          error: 'Insufficient balance' 
        });
      }

      // Verify user has payout account
      const { data: payoutAccount, error: accountError } = await supabase
        .from('user_payout_accounts')
        .select('id')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .single();

      if (accountError || !payoutAccount) {
        return res.status(400).json({ 
          success: false, 
          error: 'No active payout account found' 
        });
      }

      const { data, error } = await supabase
        .from('withdrawals')
        .insert([{
          user_id,
          wallet_id: wallet.id,
          amount: parseFloat(amount),
          payment_method,
          status: status || 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select(`
          *,
          users (*),
          wallets (*)
        `);

      if (error) {
        console.error('Error creating withdrawal:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to create withdrawal request' 
        });
      }

      res.status(201).json({
        success: true,
        message: 'Withdrawal request created successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in createWithdrawal:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];

// UPDATE withdrawal status
export const updateWithdrawalStatus = [
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['pending', 'processing', 'completed', 'failed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid status' 
        });
      }

      const { data: withdrawal, error: withdrawalError } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('id', id)
        .single();

      if (withdrawalError || !withdrawal) {
        return res.status(404).json({ 
          success: false, 
          error: 'Withdrawal not found' 
        });
      }

      // If completing withdrawal, deduct from wallet
      if (status === 'completed' && withdrawal.status !== 'completed') {
        const { error: walletError } = await supabase
          .from('wallets')
          .update({
            balance: supabase.sql`balance - ${withdrawal.amount}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', withdrawal.wallet_id);

        if (walletError) throw walletError;

        // Create payout transaction
        await supabase
          .from('payout_transactions')
          .insert([{
            user_id: withdrawal.user_id,
            withdrawal_id: id,
            amount: withdrawal.amount,
            status: 'completed',
            payment_method: withdrawal.payment_method,
            created_at: new Date().toISOString()
          }]);
      }

      const { data, error } = await supabase
        .from('withdrawals')
        .update({ 
          status, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', id)
        .select(`
          *,
          users (*),
          wallets (*)
        `);

      if (error) {
        console.error('Error updating withdrawal:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update withdrawal' 
        });
      }

      res.json({
        success: true,
        message: 'Withdrawal status updated successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in updateWithdrawalStatus:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];
