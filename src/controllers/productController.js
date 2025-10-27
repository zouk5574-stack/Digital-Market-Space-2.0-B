import { supabase } from '../config/database.js';
import { notificationService } from '../services/notificationService.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const productController = {
  // Création d'un produit digital
  createDigitalProduct: asyncHandler(async (req, res) => {
    const { 
      title, 
      description, 
      category, 
      price, 
      tags, 
      requirements,
      support_included,
      license_type,
      version 
    } = req.body;
    
    const sellerId = req.user.id;

    // Validation des données obligatoires
    if (!title || !description || !category || !price) {
      throw new AppError('Titre, description, catégorie et prix sont obligatoires', 400);
    }

    if (price < 100) {
      throw new AppError('Le prix minimum est de 100 FCFA', 400);
    }

    if (price > 1000000) {
      throw new AppError('Le prix maximum est de 1,000,000 FCFA', 400);
    }

    // Vérification des fichiers (image + fichier produit obligatoires)
    if (!req.files || !req.files.product_file || !req.files.thumbnail) {
      throw new AppError('Fichier produit et image de publicité sont obligatoires', 400);
    }

    const productFile = req.files.product_file[0];
    const thumbnailFile = req.files.thumbnail[0];

    // Validation du fichier produit
    if (!this.isValidProductFile(productFile)) {
      throw new AppError('Type de fichier produit non autorisé', 400);
    }

    // Validation de l'image de publicité
    if (!this.isValidImageFile(thumbnailFile)) {
      throw new AppError('Type de fichier image non autorisé', 400);
    }

    // Upload des fichiers vers Supabase Storage
    const productFileUrl = await this.uploadToStorage(productFile, 'product-files');
    const thumbnailUrl = await this.uploadToStorage(thumbnailFile, 'product-thumbnails');

    if (!productFileUrl || !thumbnailUrl) {
      throw new AppError('Erreur lors de l\'upload des fichiers', 500);
    }

    // Création du produit digital
    const { data: product, error: productError } = await supabase
      .from('digital_products')
      .insert({
        seller_id: sellerId,
        title: title.trim(),
        description: description.trim(),
        category: category,
        price: Math.round(price),
        tags: tags || [],
        requirements: requirements || '',
        support_included: support_included || false,
        license_type: license_type || 'standard',
        version: version || '1.0',
        files: [{
          id: this.generateFileId(),
          name: productFile.originalname,
          url: productFileUrl,
          size: productFile.size,
          type: productFile.mimetype,
          uploaded_at: new Date().toISOString()
        }],
        thumbnail_url: thumbnailUrl,
        status: 'active',
        total_sales: 0,
        total_earnings: 0,
        average_rating: 0,
        review_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select(`
        *,
        seller:users(id, first_name, last_name, username, rating)
      `)
      .single();

    if (productError) {
      log.error('Erreur création produit digital:', productError);
      
      // Nettoyage des fichiers uploadés en cas d'erreur
      await this.cleanupUploadedFiles([productFileUrl, thumbnailUrl]);
      
      throw new AppError('Erreur lors de la création du produit', 500);
    }

    log.info('Produit digital créé avec succès', {
      productId: product.id,
      sellerId: sellerId,
      title: product.title,
      price: product.price
    });

    res.status(201).json({
      success: true,
      message: 'Produit digital créé avec succès',
      data: {
        product: product
      }
    });
  }),

  // Mise à jour d'un produit digital
  updateDigitalProduct: asyncHandler(async (req, res) => {
    const { product_id } = req.params;
    const sellerId = req.user.id;
    const updateData = req.body;

    // Vérification du produit et des permissions
    const { data: existingProduct, error: productError } = await supabase
      .from('digital_products')
      .select('*')
      .eq('id', product_id)
      .eq('seller_id', sellerId)
      .single();

    if (productError || !existingProduct) {
      throw new AppError('Produit non trouvé ou non autorisé', 404);
    }

    // Validation du prix si fourni
    if (updateData.price && updateData.price < 100) {
      throw new AppError('Le prix minimum est de 100 FCFA', 400);
    }

    // Gestion des fichiers si fournis
    let filesUpdate = {};
    if (req.files) {
      if (req.files.product_file) {
        const productFile = req.files.product_file[0];
        if (!this.isValidProductFile(productFile)) {
          throw new AppError('Type de fichier produit non autorisé', 400);
        }
        const productFileUrl = await this.uploadToStorage(productFile, 'product-files');
        if (!productFileUrl) {
          throw new AppError('Erreur upload fichier produit', 500);
        }
        
        filesUpdate.files = [{
          id: this.generateFileId(),
          name: productFile.originalname,
          url: productFileUrl,
          size: productFile.size,
          type: productFile.mimetype,
          uploaded_at: new Date().toISOString()
        }];
        
        // Nettoyage de l'ancien fichier
        await this.cleanupUploadedFiles([existingProduct.files[0]?.url]);
      }

      if (req.files.thumbnail) {
        const thumbnailFile = req.files.thumbnail[0];
        if (!this.isValidImageFile(thumbnailFile)) {
          throw new AppError('Type de fichier image non autorisé', 400);
        }
        const thumbnailUrl = await this.uploadToStorage(thumbnailFile, 'product-thumbnails');
        if (!thumbnailUrl) {
          throw new AppError('Erreur upload image', 500);
        }
        
        filesUpdate.thumbnail_url = thumbnailUrl;
        
        // Nettoyage de l'ancienne image
        await this.cleanupUploadedFiles([existingProduct.thumbnail_url]);
      }
    }

    // Préparation des données de mise à jour
    const updatePayload = {
      ...updateData,
      ...filesUpdate,
      updated_at: new Date().toISOString()
    };

    // Mise à jour du produit
    const { data: updatedProduct, error: updateError } = await supabase
      .from('digital_products')
      .update(updatePayload)
      .eq('id', product_id)
      .select(`
        *,
        seller:users(id, first_name, last_name, username, rating)
      `)
      .single();

    if (updateError) {
      log.error('Erreur mise à jour produit digital:', updateError);
      throw new AppError('Erreur lors de la mise à jour du produit', 500);
    }

    log.info('Produit digital mis à jour', {
      productId: product_id,
      sellerId: sellerId
    });

    res.json({
      success: true,
      message: 'Produit mis à jour avec succès',
      data: {
        product: updatedProduct
      }
    });
  }),

  // Suppression d'un produit digital
  deleteDigitalProduct: asyncHandler(async (req, res) => {
    const { product_id } = req.params;
    const sellerId = req.user.id;

    // Vérification du produit et des permissions
    const { data: product, error: productError } = await supabase
      .from('digital_products')
      .select('files, thumbnail_url')
      .eq('id', product_id)
      .eq('seller_id', sellerId)
      .single();

    if (productError || !product) {
      throw new AppError('Produit non trouvé ou non autorisé', 404);
    }

    // Vérification qu'il n'y a pas d'achats en cours
    const { data: activePurchases, error: purchaseError } = await supabase
      .from('product_purchases')
      .select('id')
      .eq('product_id', product_id)
      .in('status', ['pending', 'paid'])
      .limit(1);

    if (purchaseError) {
      log.error('Erreur vérification achats actifs:', purchaseError);
    }

    if (activePurchases && activePurchases.length > 0) {
      throw new AppError('Impossible de supprimer un produit avec des achats en cours', 400);
    }

    // Désactivation plutôt que suppression
    const { error: updateError } = await supabase
      .from('digital_products')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('id', product_id);

    if (updateError) {
      log.error('Erreur désactivation produit:', updateError);
      throw new AppError('Erreur lors de la suppression du produit', 500);
    }

    // Nettoyage des fichiers (optionnel - selon votre politique de rétention)
    // await this.cleanupUploadedFiles([
    //   ...product.files.map(f => f.url),
    //   product.thumbnail_url
    // ]);

    log.info('Produit digital désactivé', {
      productId: product_id,
      sellerId: sellerId
    });

    res.json({
      success: true,
      message: 'Produit supprimé avec succès'
    });
  }),

  // Liste des produits digitaux du vendeur
  getSellerProducts: asyncHandler(async (req, res) => {
    const sellerId = req.user.id;
    const { page = 1, limit = 10, status = 'active' } = req.query;

    const offset = (page - 1) * limit;

    const { data: products, error, count } = await supabase
      .from('digital_products')
      .select(`
        *,
        seller:users(id, first_name, last_name, username, rating)
      `, { count: 'exact' })
      .eq('seller_id', sellerId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      log.error('Erreur récupération produits vendeur:', error);
      throw new AppError('Erreur lors de la récupération des produits', 500);
    }

    res.json({
      success: true,
      data: {
        products: products || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  }),

  // Détails d'un produit spécifique
  getProductDetails: asyncHandler(async (req, res) => {
    const { product_id } = req.params;

    const { data: product, error } = await supabase
      .from('digital_products')
      .select(`
        *,
        seller:users(
          id,
          first_name,
          last_name,
          username,
          rating,
          response_rate,
          completed_orders,
          created_at
        ),
        reviews:product_reviews(
          id,
          rating,
          comment,
          created_at,
          user:users(id, first_name, last_name, username)
        )
      `)
      .eq('id', product_id)
      .eq('status', 'active')
      .single();

    if (error || !product) {
      throw new AppError('Produit non trouvé', 404);
    }

    // Incrémentation du compteur de vues
    await supabase
      .from('digital_products')
      .update({
        view_count: (product.view_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', product_id);

    res.json({
      success: true,
      data: {
        product: product
      }
    });
  }),

  // Recherche et filtrage des produits digitaux
  searchProducts: asyncHandler(async (req, res) => {
    const { 
      query, 
      category, 
      min_price, 
      max_price, 
      sort_by = 'created_at',
      sort_order = 'desc',
      page = 1, 
      limit = 12 
    } = req.query;

    const offset = (page - 1) * limit;

    let supabaseQuery = supabase
      .from('digital_products')
      .select(`
        *,
        seller:users(id, first_name, last_name, username, rating)
      `, { count: 'exact' })
      .eq('status', 'active');

    // Filtre par recherche textuelle
    if (query) {
      supabaseQuery = supabaseQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%,tags.cs.{${query}}`);
    }

    // Filtre par catégorie
    if (category) {
      supabaseQuery = supabaseQuery.eq('category', category);
    }

    // Filtre par prix
    if (min_price) {
      supabaseQuery = supabaseQuery.gte('price', parseInt(min_price));
    }
    if (max_price) {
      supabaseQuery = supabaseQuery.lte('price', parseInt(max_price));
    }

    // Tri
    supabaseQuery = supabaseQuery.order(sort_by, { 
      ascending: sort_order === 'asc' 
    });

    // Pagination
    supabaseQuery = supabaseQuery.range(offset, offset + limit - 1);

    const { data: products, error, count } = await supabaseQuery;

    if (error) {
      log.error('Erreur recherche produits:', error);
      throw new AppError('Erreur lors de la recherche des produits', 500);
    }

    res.json({
      success: true,
      data: {
        products: products || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        },
        filters: {
          query,
          category,
          min_price,
          max_price
        }
      }
    });
  }),

  // === MÉTHODES UTILITAIRES ===

  // Validation du fichier produit
  isValidProductFile(file) {
    const allowedTypes = [
      'application/pdf',
      'application/zip',
      'application/x-rar-compressed',
      'text/markdown',
      'application/epub+zip',
      'video/mp4',
      'audio/mpeg',
      'image/svg+xml',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    
    const maxSize = 100 * 1024 * 1024; // 100MB
    
    return allowedTypes.includes(file.mimetype) && file.size <= maxSize;
  },

  // Validation du fichier image
  isValidImageFile(file) {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/gif'
    ];
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    return allowedTypes.includes(file.mimetype) && file.size <= maxSize;
  },

  // Upload vers Supabase Storage
  async uploadToStorage(file, bucket) {
    try {
      const fileName = `${Date.now()}-${file.originalname}`;
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600'
        });

      if (error) {
        log.error('Erreur upload storage:', error);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      log.error('Erreur inattendue upload:', error);
      return null;
    }
  },

  // Nettoyage des fichiers uploadés
  async cleanupUploadedFiles(fileUrls) {
    try {
      for (const url of fileUrls) {
        if (!url) continue;
        
        const fileName = url.split('/').pop();
        const bucket = url.includes('product-files') ? 'product-files' : 'product-thumbnails';
        
        await supabase.storage
          .from(bucket)
          .remove([fileName]);
      }
    } catch (error) {
      log.error('Erreur nettoyage fichiers:', error);
    }
  },

  // Génération d'ID de fichier
  generateFileId() {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  // === ACHAT DE PRODUITS (fonctions existantes) ===

  // Achat d'un produit digital
  purchaseDigitalProduct: asyncHandler(async (req, res) => {
    const { product_id } = req.params;
    const buyerId = req.user.id;

    // Vérification du produit
    const { data: product, error: productError } = await supabase
      .from('digital_products')
      .select('*')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      throw new AppError('Produit non trouvé', 404);
    }

    // Vérification que le produit est disponible
    if (product.status !== 'active') {
      throw new AppError('Ce produit n\'est pas disponible à l\'achat', 400);
    }

    // Vérification que l'acheteur n'est pas le vendeur
    if (product.seller_id === buyerId) {
      throw new AppError('Vous ne pouvez pas acheter votre propre produit', 400);
    }

    // Vérification s'il y a déjà un achat en cours ou réussi
    const { data: existingPurchase, error: purchaseError } = await supabase
      .from('product_purchases')
      .select('id, status')
      .eq('product_id', product_id)
      .eq('buyer_id', buyerId)
      .in('status', ['pending', 'paid', 'completed'])
      .single();

    if (existingPurchase && !purchaseError) {
      if (existingPurchase.status === 'completed') {
        throw new AppError('Vous avez déjà acheté ce produit', 409);
      }
      throw new AppError('Un achat est déjà en cours pour ce produit', 409);
    }

    // Création de l'achat
    const { data: purchase, error: createError } = await supabase
      .from('product_purchases')
      .insert({
        product_id: product_id,
        buyer_id: buyerId,
        seller_id: product.seller_id,
        amount: product.price,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select(`
        *,
        product:digital_products(*),
        buyer:users(id, first_name, last_name, email),
        seller:users(id, first_name, last_name, email)
      `)
      .single();

    if (createError) {
      log.error('Erreur création achat produit:', createError);
      throw new AppError('Erreur lors de la création de l\'achat', 500);
    }

    log.info('Achat produit digital créé - Paiement requis', {
      purchaseId: purchase.id,
      productId: product_id,
      buyerId: buyerId,
      sellerId: product.seller_id,
      amount: product.price
    });

    res.status(201).json({
      success: true,
      message: 'Achat créé avec succès. Veuillez procéder au paiement pour accéder au produit.',
      data: {
        purchase: purchase,
        payment_required: true,
        next_step: 'initialize_payment'
      }
    });
  }),

  // Accès au produit digital après paiement
  accessDigitalProduct: asyncHandler(async (req, res) => {
    const { product_id } = req.params;
    const userId = req.user.id;

    // Vérification de l'achat
    const { data: purchase, error: purchaseError } = await supabase
      .from('product_purchases')
      .select(`
        *,
        product:digital_products(*)
      `)
      .eq('product_id', product_id)
      .eq('buyer_id', userId)
      .eq('status', 'completed')
      .single();

    if (purchaseError || !purchase) {
      throw new AppError('Achat non trouvé ou produit non payé', 404);
    }

    // Vérification que le produit est toujours actif
    if (purchase.product.status !== 'active') {
      throw new AppError('Ce produit n\'est plus disponible', 410);
    }

    // Enregistrement de l'accès
    await supabase
      .from('product_access_logs')
      .insert({
        product_id: product_id,
        user_id: userId,
        purchase_id: purchase.id,
        accessed_at: new Date().toISOString()
      });

    log.info('Accès au produit digital', {
      productId: product_id,
      userId: userId,
      purchaseId: purchase.id
    });

    res.json({
      success: true,
      data: {
        product: {
          id: purchase.product.id,
          title: purchase.product.title,
          description: purchase.product.description,
          files: purchase.product.files,
          download_url: purchase.product.download_url,
          access_expires_at: purchase.product.access_expires_at
        },
        purchase: {
          id: purchase.id,
          purchased_at: purchase.created_at,
          amount: purchase.amount
        }
      }
    });
  }),

  // Historique des achats de produits digitaux
  getPurchaseHistory: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const offset = (page - 1) * limit;

    const { data: purchases, error, count } = await supabase
      .from('product_purchases')
      .select(`
        *,
        product:digital_products(
          id,
          title,
          description,
          category,
          thumbnail_url
        ),
        seller:users(id, first_name, last_name, username, rating)
      `, { count: 'exact' })
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      log.error('Erreur récupération historique achats:', error);
      throw new AppError('Erreur lors de la récupération de l\'historique', 500);
    }

    res.json({
      success: true,
      data: {
        purchases: purchases || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  })
};