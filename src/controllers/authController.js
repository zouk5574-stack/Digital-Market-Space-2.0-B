// src/controllers/authController.js
import { supabase } from '../config/supabase.js';
import Joi from 'joi';

// Schémas de validation pour l'authentification
export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'L\'email doit être une adresse valide',
    'string.empty': 'L\'email est requis'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Le mot de passe doit contenir au moins 6 caractères',
    'string.empty': 'Le mot de passe est requis'
  })
});

export const registerSchema = Joi.object({
  // Informations de connexion
  email: Joi.string().email().required().messages({
    'string.email': 'L\'email doit être une adresse valide',
    'string.empty': 'L\'email est requis'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Le mot de passe doit contenir au moins 6 caractères',
    'string.empty': 'Le mot de passe est requis'
  }),
  confirm_password: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Les mots de passe ne correspondent pas',
    'string.empty': 'La confirmation du mot de passe est requise'
  }),

  // Informations personnelles
  username: Joi.string().min(3).max(30).pattern(/^[a-zA-Z0-9_]+$/).required().messages({
    'string.min': 'Le nom d\'utilisateur doit contenir au moins 3 caractères',
    'string.max': 'Le nom d\'utilisateur ne peut pas dépasser 30 caractères',
    'string.pattern.base': 'Le nom d\'utilisateur ne peut contenir que des lettres, chiffres et underscores',
    'string.empty': 'Assurez-vous que ce soit des informations juste car une vérification d\'identité s\'imposeras et tout faux compte sera à bannir définitivement 🚫'
  }),
  first_name: Joi.string().max(100).required().messages({
    'string.max': 'Le prénom ne peut pas dépasser 100 caractères',
    'string.empty': 'Assurez-vous que ce soit des informations juste car une vérification d\'identité s\'imposeras et tout faux compte sera à bannir définitivement 🚫'
  }),
  last_name: Joi.string().max(100).required().messages({
    'string.max': 'Le nom ne peut pas dépasser 100 caractères',
    'string.empty': 'Assurez-vous que ce soit des informations juste car une vérification d\'identité s\'imposeras et tout faux compte sera à bannir définitivement 🚫'
  }),

  // Contact
  phone: Joi.string().pattern(/^\+?[0-9\s\-\(\)]{10,}$/).required().messages({
    'string.pattern.base': 'Le numéro de téléphone doit être valide',
    'string.empty': 'Le numéro de téléphone est requis'
  }),
  
  // Rôle
  role: Joi.string().valid('buyer', 'seller').required().messages({
    'any.only': 'Le rôle doit être "acheteur" ou "vendeur"',
    'string.empty': 'Le rôle est requis'
  }),

  // Adresse - SEULEMENT LE PAYS
  country: Joi.string().max(100).required().messages({
    'string.max': 'Le pays ne peut pas dépasser 100 caractères',
    'string.empty': 'Le pays est requis'
  }),

  // Informations supplémentaires pour les vendeurs
  seller_info: Joi.when('role', {
    is: 'seller',
    then: Joi.object({
      shop_name: Joi.string().max(255).required().messages({
        'string.max': 'Le nom de la boutique ne peut pas dépasser 255 caractères',
        'string.empty': 'Le nom de la boutique est requis pour les vendeurs'
      }),
      shop_description: Joi.string().max(1000).optional().allow(''),
      business_type: Joi.string().max(100).required().messages({
        'string.max': 'Le type d\'entreprise ne peut pas dépasser 100 caractères',
        'string.empty': 'Le type d\'entreprise est requis pour les vendeurs'
      })
    }).required(),
    otherwise: Joi.optional()
  }),

  // Consentements
  accept_terms: Joi.boolean().valid(true).required().messages({
    'any.only': 'Vous devez accepter les conditions d\'utilisation',
    'boolean.base': 'L\'acceptation des conditions est requise'
  }),
  accept_privacy: Joi.boolean().valid(true).required().messages({
    'any.only': 'Vous devez accepter la politique de confidentialité',
    'boolean.base': 'L\'acceptation de la politique de confidentialité est requise'
  }),
  newsletter: Joi.boolean().default(false)
});

export const validateAuthRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true 
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      return res.status(400).json({ 
        success: false,
        error: 'Validation des données échouée', 
        details: errors 
      });
    }
    
    req.body = value;
    next();
  };
};

// LOGIN utilisateur
export const login = [
  validateAuthRequest(loginSchema),
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        
        // Messages d'erreur plus spécifiques
        let errorMessage = 'Identifiants invalides';
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Email ou mot de passe incorrect';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Veuillez confirmer votre adresse email avant de vous connecter';
        } else if (error.message.includes('Email rate limit exceeded')) {
          errorMessage = 'Trop de tentatives de connexion. Veuillez réessayer plus tard.';
        }
        
        return res.status(401).json({ 
          success: false,
          error: errorMessage 
        });
      }

      // Récupérer le profil utilisateur depuis public.users avec relations complètes
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select(`
          *,
          wallets (*),
          shops (*),
          user_payout_accounts (*)
        `)
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.error('Erreur de récupération du profil:', profileError);
        return res.status(500).json({ 
          success: false,
          error: 'Profil utilisateur non trouvé' 
        });
      }

      // Vérifier si l'utilisateur est actif
      if (!profile.is_active) {
        return res.status(403).json({ 
          success: false,
          error: 'Compte suspendu. Veuillez contacter le support.' 
        });
      }

      res.json({
        success: true,
        message: 'Connexion réussie',
        data: {
          user: {
            ...data.user,
            profile: profile
          },
          session: data.session
        }
      });

    } catch (error) {
      console.error('Erreur serveur lors de la connexion:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erreur interne du serveur' 
      });
    }
  }
];

// REGISTER utilisateur avec pays seulement
export const register = [
  validateAuthRequest(registerSchema),
  async (req, res) => {
    try {
      const { 
        email, 
        password, 
        username, 
        first_name, 
        last_name, 
        phone,
        role,
        country, // SEULEMENT LE PAYS
        seller_info,
        newsletter
      } = req.body;

      console.log('Tentative d\'inscription:', { email, username, role, country });

      // Vérifier si l'username ou email existe déjà
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id, username, email')
        .or(`username.ilike.${username},email.ilike.${email}`)
        .single();

      if (existingUser) {
        const field = existingUser.username.toLowerCase() === username.toLowerCase() ? 'username' : 'email';
        return res.status(409).json({ 
          success: false,
          error: `${field === 'username' ? 'Le nom d\'utilisateur' : 'L\'email'} est déjà utilisé` 
        });
      }

      // Créer l'utilisateur dans l'auth Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            first_name,
            last_name,
            phone,
            role,
            country, // Stocker le pays dans les métadonnées
            newsletter: newsletter || false
          },
          emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/confirm`
        }
      });

      if (authError) {
        console.error('Erreur d\'inscription auth:', authError);
        
        let errorMessage = authError.message;
        if (authError.message.includes('User already registered')) {
          errorMessage = 'Un compte avec cet email existe déjà';
        } else if (authError.message.includes('Password should be at least')) {
          errorMessage = 'Le mot de passe doit contenir au moins 6 caractères';
        }
        
        return res.status(400).json({ 
          success: false,
          error: errorMessage 
        });
      }

      if (!authData.user) {
        return res.status(500).json({ 
          success: false,
          error: 'Erreur lors de la création du compte' 
        });
      }

      // Créer le profil utilisateur dans public.users
      const userProfileData = {
        id: authData.user.id,
        username,
        email,
        first_name,
        last_name,
        phone,
        country, // SEULEMENT LE PAYS
        role,
        newsletter: newsletter || false,
        is_active: true,
        email_confirmed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .insert([userProfileData])
        .select()
        .single();

      if (profileError) {
        console.error('Erreur de création du profil:', profileError);
        
        // Rollback: supprimer l'utilisateur auth
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('Erreur lors de la suppression de l\'utilisateur auth:', deleteError);
        }
        
        return res.status(500).json({ 
          success: false,
          error: 'Erreur lors de la création du profil utilisateur' 
        });
      }

      // Créer le wallet pour l'utilisateur
      const { error: walletError } = await supabase
        .from('wallets')
        .insert([{
          user_id: authData.user.id,
          balance: 0,
          currency: 'XOF',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (walletError) {
        console.error('Erreur de création du wallet:', walletError);
        // Continuer même si le wallet échoue
      }

      // Si l'utilisateur est un vendeur, créer sa boutique
      if (role === 'seller' && seller_info) {
        const { error: shopError } = await supabase
          .from('shops')
          .insert([{
            user_id: authData.user.id,
            name: seller_info.shop_name,
            description: seller_info.shop_description || `Bienvenue dans la boutique de ${username}`,
            business_type: seller_info.business_type,
            contact_email: email,
            contact_phone: phone,
            country: country, // Utiliser le pays de l'utilisateur
            is_active: true,
            verified: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (shopError) {
          console.error('Erreur de création de la boutique:', shopError);
          // Continuer même si la boutique échoue
        }
      }

      // Préparer la réponse
      const response = {
        success: true,
        message: 'Inscription réussie!',
        data: {
          user: {
            ...authData.user,
            profile: profileData
          }
        }
      };

      // Ajouter le message de confirmation email si nécessaire
      if (authData.user?.identities?.length === 0) {
        response.message = 'Inscription réussie! Veuillez vérifier votre email pour confirmer votre compte.';
        response.requires_email_confirmation = true;
      } else if (authData.session) {
        response.data.session = authData.session;
      }

      res.status(201).json(response);

    } catch (error) {
      console.error('Erreur serveur lors de l\'inscription:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erreur interne du serveur' 
      });
    }
  }
];

// LOGOUT utilisateur
export const logout = async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Erreur de déconnexion:', error);
      return res.status(400).json({ 
        success: false,
        error: error.message 
      });
    }

    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });

  } catch (error) {
    console.error('Erreur serveur lors de la déconnexion:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur interne du serveur' 
    });
  }
};

// GET current user profile
export const getCurrentUser = async (req, res) => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return res.status(401).json({ 
        success: false,
        error: 'Non authentifié' 
      });
    }

    // Construire la query en fonction du rôle
    let query = supabase
      .from('users')
      .select(`
        *,
        wallets (*),
        user_payout_accounts (*)
      `)
      .eq('id', user.id);

    // Ajouter les relations spécifiques au rôle
    const userMetadata = user.user_metadata || {};
    if (userMetadata.role === 'seller') {
      query = query.select(`
        *,
        wallets (*),
        user_payout_accounts (*),
        shops (*, 
          products (*, 
            categories (*),
            product_files (*)
          )
        ),
        freelance_missions!freelance_missions_client_id_fkey (*)
      `);
    } else if (userMetadata.role === 'buyer') {
      query = query.select(`
        *,
        wallets (*),
        user_payout_accounts (*),
        orders (*, 
          order_items (*, 
            products (*,
              categories (*),
              shops (*)
            )
          )
        ),
        freelance_missions!freelance_missions_freelance_id_fkey (
          *,
          clients:users!freelance_missions_client_id_fkey (*),
          categories (*)
        )
      `);
    }

    const { data: profile, error: profileError } = await query.single();

    if (profileError) {
      console.error('Erreur de récupération du profil:', profileError);
      return res.status(500).json({ 
        success: false,
        error: 'Erreur lors de la récupération du profil' 
      });
    }

    // Vérifier si l'utilisateur est actif
    if (!profile.is_active) {
      return res.status(403).json({ 
        success: false,
        error: 'Compte suspendu' 
      });
    }

    res.json({
      success: true,
      data: {
        ...user,
        profile: profile
      }
    });

  } catch (error) {
    console.error('Erreur serveur lors de la récupération du profil:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur interne du serveur' 
    });
  }
};

// REFRESH token
export const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ 
        success: false,
        error: 'Le refresh token est requis' 
      });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      console.error('Erreur de rafraîchissement du token:', error);
      return res.status(401).json({ 
        success: false,
        error: 'Refresh token invalide ou expiré' 
      });
    }

    res.json({
      success: true,
      message: 'Token rafraîchi avec succès',
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        user: data.user
      }
    });

  } catch (error) {
    console.error('Erreur serveur lors du rafraîchissement du token:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur interne du serveur' 
    });
  }
};
