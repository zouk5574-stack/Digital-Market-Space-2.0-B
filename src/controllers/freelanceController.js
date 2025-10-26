// src/controllers/freelanceController.js
import { supabase } from '../config/supabase.js';
import { freelanceMissionSchema, validateRequest, validateUUID } from '../middleware/validation.js';

// GET all freelance missions with pagination
export const getFreelanceMissions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      client_id, 
      freelance_id,
      status,
      category_id,
      min_budget,
      max_budget,
      search,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('freelance_missions')
      .select(`
        *,
        clients:users!freelance_missions_client_id_fkey (*),
        freelancers:users!freelance_missions_freelance_id_fkey (*),
        categories (*),
        freelance_applications (*, users (*)),
        freelance_deliveries (*)
      `, { count: 'exact' });

    // Apply filters
    if (client_id) query = query.eq('client_id', client_id);
    if (freelance_id) query = query.eq('freelance_id', freelance_id);
    if (status) query = query.eq('status', status);
    if (category_id) query = query.eq('category_id', category_id);
    if (min_budget) query = query.gte('budget', parseFloat(min_budget));
    if (max_budget) query = query.lte('budget', parseFloat(max_budget));
    if (search) query = query.ilike('title', `%${search}%`);

    const { data, error, count } = await query.range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Error fetching freelance missions:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch missions' 
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
    console.error('Server error in getFreelanceMissions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

// CREATE freelance mission
export const createFreelanceMission = [
  validateRequest(freelanceMissionSchema),
  async (req, res) => {
    try {
      const { 
        title, 
        description, 
        budget, 
        client_id, 
        deadline, 
        category_id,
        skills_required,
        status 
      } = req.body;

      // Verify client exists
      const { data: client, error: clientError } = await supabase
        .from('users')
        .select('id')
        .eq('id', client_id)
        .single();

      if (clientError || !client) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid client' 
        });
      }

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

      const { data, error } = await supabase
        .from('freelance_missions')
        .insert([{
          title,
          description,
          budget: parseFloat(budget),
          client_id,
          deadline: new Date(deadline).toISOString(),
          category_id,
          skills_required: skills_required || [],
          status: status || 'published',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select(`
          *,
          clients:users!freelance_missions_client_id_fkey (*),
          categories (*)
        `);

      if (error) {
        console.error('Error creating freelance mission:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to create mission' 
        });
      }

      res.status(201).json({
        success: true,
        message: 'Freelance mission created successfully',
        data: data[0]
      });

    } catch (error) {
      console.error('Server error in createFreelanceMission:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
];
