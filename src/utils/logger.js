const { supabase } = require('../config/supabase');

exports.logAction = async (userId, action, metadata = {}) => {
  try {
    const { error } = await supabase
      .from('admin_logs')
      .insert({
        user_id: userId,
        action: action,
        metadata: metadata,
        ip_address: metadata.ip_address || null,
        user_agent: metadata.user_agent || null
      });

    if (error) {
      console.error('Logging error:', error);
    }
  } catch (error) {
    console.error('Logging system error:', error);
  }
};

exports.getUserLogs = async (userId, limit = 50) => {
  try {
    const { data, error } = await supabase
      .from('admin_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Get user logs error:', error);
    return [];
  }
};
