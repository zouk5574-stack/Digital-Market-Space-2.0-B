import multer from 'multer';
import { AppError } from './errorHandler.js';

// Configuration Multer pour le stockage en mémoire
const storage = multer.memoryStorage();

// Filtrage des fichiers
const fileFilter = (req, file, cb) => {
  // Fichiers produits autorisés
  const productAllowedTypes = [
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

  // Images autorisées
  const imageAllowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png', 
    'image/webp',
    'image/gif'
  ];

  if (file.fieldname === 'product_file') {
    if (productAllowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Type de fichier produit non autorisé', 400), false);
    }
  } else if (file.fieldname === 'thumbnail') {
    if (imageAllowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Type de fichier image non autorisé', 400), false);
    }
  } else {
    cb(new AppError('Champ de fichier non reconnu', 400), false);
  }
};

// Configuration Multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max pour les produits
    files: 2 // Max 2 fichiers (produit + thumbnail)
  }
});

// Middleware pour l'upload des produits digitaux
export const uploadProductFiles = upload.fields([
  { name: 'product_file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Middleware pour l'upload de thumbnail seulement
export const uploadThumbnailOnly = upload.single('thumbnail');

// Middleware pour l'upload de fichier produit seulement  
export const uploadProductFileOnly = upload.single('product_file');