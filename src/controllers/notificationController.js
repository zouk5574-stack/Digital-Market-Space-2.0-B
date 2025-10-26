// src/controllers/notificationController.js
import { supabase } from '../config/supabase.js';
import { validateUUID } from '../middleware/validation.js';

// GET user notifications
export const getUserNotifications = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      is_read,
      type,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user_id);

    // Apply filters
    if (is_read !== undefined) query = query.eq('is_read', is_read === 'true');
    if (type) query = query.eq('type', type);

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const { data, error, count } = await query.range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Error fetching notifications:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch notifications' 
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
    console.error('Server error in getUserNotifications:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// CREATE notification
export const createNotification = async (req, res) => {
  try {
    const { 
      user_id, 
      title, 
      message, 
      type, 
      related_id,
      related_type 
    } = req.body;

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

    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        user_id,
        title,
        message,
        type: type || 'info',
        related_id: related_id || null,
        related_type: related_type || null,
        is_read: false,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('Error creating notification:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create notification' 
      });
    }

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: data[0]
    });

  } catch (error) {
    console.error('Server error in createNotification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// MARK notification as read
export const markNotificationAsRead = [
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('notifications')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error updating notification:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update notification' 
        });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Notification not found' 
        });
      }

      res.json({
        success: true,
        message: 'Notification marked as read',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in markNotificationAsRead:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];

// DELETE notification
export const deleteNotification = [
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error deleting notification:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to delete notification' 
        });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Notification not found' 
        });
      }

      res.json({
        success: true,
        message: 'Notification deleted successfully'
      });

    } catch (error) {
      console.error('Server error in deleteNotification:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];
