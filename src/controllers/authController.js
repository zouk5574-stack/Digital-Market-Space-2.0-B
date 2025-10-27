import { supabase } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const authController = {
  // Inscription
  register: asyncHandler(async (req, res) => {
    const { email, password, first_name, last_name, phone, username } = req.body;

    // Validation des données
    if (!email || !password || !first_name || !last_name) {
      throw new AppError('Tous les champs obligatoires doivent être remplis', 400);
    }

    if (password.length < 8) {
      throw new AppError('Le mot de passe doit contenir au moins 8 caractères', 400);
    }

    // Vérification si l'email existe déjà
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw new AppError('Un utilisateur avec cet email existe déjà', 409);
    }

    // Vérification du username
    if (username) {
      const { data: existingUsername } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (existingUsername) {
        throw new AppError('Ce nom d\'utilisateur est déjà pris', 409);
      }
    }

    // Inscription avec Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name,
          last_name,
          username: username || null
        }
      }
    });

    if (authError) {
      log.error('Erreur inscription Supabase:', authError);
      throw new AppError(`Erreur lors de l'inscription: ${authError.message}`, 400);
    }

    // Création du profil utilisateur dans public.users
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        first_name,
        last_name,
        phone: phone || null,
        username: username || null,
        balance: 0,
        rating: 0,
        response_rate: 0,
        completed_missions: 0,
        completed_orders: 0,
        role_id: 2, // Rôle utilisateur par défaut
        profile_data: {},
        last_active: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      log.error('Erreur création profil utilisateur:', profileError);
      
      // Rollback: suppression du compte auth si échec
      await supabase.auth.admin.deleteUser(authData.user.id);
      
      throw new AppError('Erreur lors de la création du profil', 500);
    }

    log.info('Nouvel utilisateur inscrit', { userId: authData.user.id, email });

    res.status(201).json({
      success: true,
      message: 'Inscription réussie. Veuillez vérifier votre email.',
      data: {
        user: {
          id: authData.user.id,
          email: authData.user.email,
          first_name,
          last_name,
          username
        },
        session: authData.session
      }
    });
  }),

  // Connexion
  login: asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email et mot de passe requis', 400);
    }

    // Authentification avec Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      log.warn('Tentative de connexion échouée', { email, error: authError.message });
      
      if (authError.message === 'Invalid login credentials') {
        throw new AppError('Email ou mot de passe incorrect', 401);
      }
      
      throw new AppError(`Erreur de connexion: ${authError.message}`, 400);
    }

    // Récupération du profil utilisateur
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      log.error('Profil utilisateur non trouvé après connexion:', profileError);
      throw new AppError('Erreur lors de la récupération du profil', 500);
    }

    // Mise à jour last_active
    await supabase
      .from('users')
      .update({ 
        last_active: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', authData.user.id);

    log.info('Utilisateur connecté', { userId: authData.user.id, email });

    res.json({
      success: true,
      message: 'Connexion réussie',
      data: {
        user: {
          ...userProfile,
          auth_metadata: authData.user
        },
        session: authData.session
      }
    });
  }),

  // Déconnexion
  logout: asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        log.error('Erreur déconnexion:', error);
      }
    }

    log.info('Utilisateur déconnecté', { userId: req.user?.id });

    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });
  }),

  // Rafraîchissement du token
  refreshToken: asyncHandler(async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      throw new AppError('Refresh token requis', 400);
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      throw new AppError('Token de rafraîchissement invalide', 401);
    }

    res.json({
      success: true,
      message: 'Token rafraîchi avec succès',
      data: {
        session: data.session
      }
    });
  }),

  // Mot de passe oublié
  forgotPassword: asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email requis', 400);
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL}/reset-password`
    });

    if (error) {
      log.error('Erreur réinitialisation mot de passe:', error);
      throw new AppError('Erreur lors de l\'envoi de l\'email de réinitialisation', 500);
    }

    log.info('Email réinitialisation mot de passe envoyé', { email });

    res.json({
      success: true,
      message: 'Email de réinitialisation envoyé avec succès'
    });
  }),

  // Réinitialisation mot de passe
  resetPassword: asyncHandler(async (req, res) => {
    const { password, access_token } = req.body;

    if (!password || !access_token) {
      throw new AppError('Nouveau mot de passe et token requis', 400);
    }

    if (password.length < 8) {
      throw new AppError('Le mot de passe doit contenir au moins 8 caractères', 400);
    }

    const { error } = await supabase.auth.updateUser({
      password
    }, {
      accessToken: access_token
    });

    if (error) {
      throw new AppError('Token de réinitialisation invalide ou expiré', 400);
    }

    log.info('Mot de passe réinitialisé', { token: access_token });

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });
  }),

  // Profil utilisateur
  getProfile: asyncHandler(async (req, res) => {
    const user = req.user;

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          phone: user.phone,
          balance: user.balance,
          rating: user.rating,
          response_rate: user.response_rate,
          completed_missions: user.completed_missions,
          completed_orders: user.completed_orders,
          profile_data: user.profile_data,
          last_active: user.last_active,
          created_at: user.created_at
        }
      }
    });
  }),

  // Mise à jour profil
  updateProfile: asyncHandler(async (req, res) => {
    const { first_name, last_name, phone, username, profile_data } = req.body;
    const userId = req.user.id;

    // Vérification username unique
    if (username && username !== req.user.username) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .neq('id', userId)
        .single();

      if (existingUser) {
        throw new AppError('Ce nom d\'utilisateur est déjà pris', 409);
      }
    }

    const updateData = {
      ...(first_name && { first_name }),
      ...(last_name && { last_name }),
      ...(phone && { phone }),
      ...(username && { username }),
      ...(profile_data && { profile_data }),
      updated_at: new Date().toISOString()
    };

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      log.error('Erreur mise à jour profil:', error);
      throw new AppError('Erreur lors de la mise à jour du profil', 500);
    }

    log.info('Profil utilisateur mis à jour', { userId });

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      data: {
        user: updatedUser
      }
    });
  })
};