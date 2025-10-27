import { supabase } from '../config/database.js';
import { notificationService } from '../services/notificationService.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const productController = {
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
  }),

  // Téléchargement du fichier produit
  downloadProductFile: asyncHandler(async (req, res) => {
    const { product_id, file_id } = req.params;
    const userId = req.user.id;

    // Vérification des droits d'accès
    const { data: purchase, error: purchaseError } = await supabase
      .from('product_purchases')
      .select('id, status')
      .eq('product_id', product_id)
      .eq('buyer_id', userId)
      .eq('status', 'completed')
      .single();

    if (purchaseError || !purchase) {
      throw new AppError('Accès non autorisé au fichier', 403);
    }

    // Récupération des informations du fichier
    const { data: product, error: productError } = await supabase
      .from('digital_products')
      .select('files, title')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      throw new AppError('Produit non trouvé', 404);
    }

    // Recherche du fichier spécifique
    const file = product.files?.find(f => f.id === file_id);
    if (!file) {
      throw new AppError('Fichier non trouvé', 404);
    }

    // Log du téléchargement
    await supabase
      .from('product_download_logs')
      .insert({
        product_id: product_id,
        user_id: userId,
        file_id: file_id,
        file_name: file.name,
        downloaded_at: new Date().toISOString()
      });

    log.info('Téléchargement fichier produit', {
      productId: product_id,
      fileId: file_id,
      userId: userId,
      fileName: file.name
    });

    res.json({
      success: true,
      data: {
        download_url: file.url,
        file_name: file.name,
        file_size: file.size,
        expires_in: '24 hours' // Lien temporaire
      }
    });
  })
};