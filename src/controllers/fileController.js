// src/controllers/fileController.js
import { supabase } from '../config/supabase.js';
import { validateUUID } from '../middleware/validation.js';

// UPLOAD file
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file provided' 
      });
    }

    const { originalname, mimetype, buffer, size } = req.file;
    const { product_id, user_id, file_type } = req.body;

    // Verify product exists if provided
    if (product_id) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id')
        .eq('id', product_id)
        .single();

      if (productError || !product) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid product' 
        });
      }
    }

    // Verify user exists if provided
    if (user_id) {
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
    }

    // Upload to Supabase Storage
    const fileExt = originalname.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { data: storageData, error: storageError } = await supabase.storage
      .from('files')
      .upload(filePath, buffer, {
        contentType: mimetype,
        upsert: false
      });

    if (storageError) {
      console.error('Error uploading file to storage:', storageError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to upload file' 
      });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('files')
      .getPublicUrl(filePath);

    // Save file metadata to database
    const { data, error } = await supabase
      .from('product_files')
      .insert([{
        product_id: product_id || null,
        user_id: user_id || null,
        file_name: originalname,
        file_path: filePath,
        file_url: publicUrl,
        file_type: file_type || 'other',
        mime_type: mimetype,
        file_size: size,
        is_active: true,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('Error saving file metadata:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to save file information' 
      });
    }

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        ...data[0],
        download_url: publicUrl
      }
    });

  } catch (error) {
    console.error('Server error in uploadFile:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// GET files by product
export const getProductFiles = async (req, res) => {
  try {
    const { product_id } = req.params;
    const { 
      page = 1, 
      limit = 20,
      file_type,
      is_active = true
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('product_files')
      .select('*', { count: 'exact' })
      .eq('product_id', product_id)
      .eq('is_active', is_active === 'true');

    if (file_type) query = query.eq('file_type', file_type);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Error fetching product files:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch files' 
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
    console.error('Server error in getProductFiles:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// DELETE file
export const deleteFile = [
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Get file info first
      const { data: file, error: fileError } = await supabase
        .from('product_files')
        .select('file_path')
        .eq('id', id)
        .single();

      if (fileError || !file) {
        return res.status(404).json({ 
          success: false, 
          error: 'File not found' 
        });
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('files')
        .remove([file.file_path]);

      if (storageError) {
        console.error('Error deleting file from storage:', storageError);
        // Continue with database deletion even if storage fails
      }

      // Delete from database
      const { data, error } = await supabase
        .from('product_files')
        .delete()
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error deleting file metadata:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to delete file' 
        });
      }

      res.json({
        success: true,
        message: 'File deleted successfully'
      });

    } catch (error) {
      console.error('Server error in deleteFile:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];
