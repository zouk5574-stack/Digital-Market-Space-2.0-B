const fileService = require('../services/fileService');
const { Response, Error } = require('../utils/helpers');
const logger = require('../utils/logger');

class FileController {
  
  async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json(Response.error('Aucun fichier fourni'));
      }

      const userId = req.user.id;
      const metadata = {
        category: req.body.category || 'general',
        description: req.body.description || '',
        is_public: req.body.is_public === 'true',
        prefix: req.body.prefix
      };

      logger.info('Upload fichier initié', { 
        userId, 
        originalName: req.file.originalname,
        size: req.file.size,
        category: metadata.category
      });

      const result = await fileService.uploadFile(req.file, userId, metadata);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);

    } catch (error) {
      logger.error('Erreur upload fichier', {
        userId: req.user?.id,
        error: error.message,
        file: req.file?.originalname
      });

      res.status(500).json(Response.error('Erreur lors de l\'upload du fichier'));
    }
  }

  async uploadMultipleFiles(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json(Response.error('Aucun fichier fourni'));
      }

      const userId = req.user.id;
      const metadata = {
        category: req.body.category || 'general',
        description: req.body.description || '',
        is_public: req.body.is_public === 'true',
        prefix: req.body.prefix
      };

      logger.info('Upload multiple fichiers', { 
        userId, 
        fileCount: req.files.length,
        category: metadata.category
      });

      const uploadResults = [];
      const errors = [];

      for (const file of req.files) {
        try {
          const result = await fileService.uploadFile(file, userId, metadata);
          uploadResults.push(result);
        } catch (error) {
          errors.push({
            filename: file.originalname,
            error: error.message
          });
          logger.error('Erreur upload fichier individuel', {
            filename: file.originalname,
            error: error.message
          });
        }
      }

      const response = {
        success: true,
        message: `Upload terminé. ${uploadResults.length} succès, ${errors.length} échecs.`,
        data: {
          uploaded_files: uploadResults.filter(r => r.success).map(r => r.data),
          failed_files: errors
        },
        timestamp: new Date().toISOString()
      };

      res.status(errors.length === req.files.length ? 400 : 201).json(response);

    } catch (error) {
      logger.error('Erreur upload multiple fichiers', {
        userId: req.user?.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de l\'upload des fichiers'));
    }
  }

  async downloadFile(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;

      logger.info('Téléchargement fichier demandé', { fileId, userId });

      const result = await fileService.getFileUrl(fileId, userId);
      
      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur génération URL téléchargement', {
        userId: req.user.id,
        fileId: req.params.fileId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la génération du lien de téléchargement'));
    }
  }

  async getFileInfo(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;

      logger.debug('Récupération informations fichier', { fileId, userId });

      const file = await database.safeSelect(
        'files',
        { id: fileId },
        { single: true }
      );

      if (!file) {
        return res.status(404).json(Response.error('Fichier non trouvé'));
      }

      // Vérifier les permissions
      if (!file.is_public && file.user_id !== userId) {
        return res.status(403).json(Response.error('Accès non autorisé à ce fichier'));
      }

      const fileInfo = {
        id: file.id,
        original_name: file.original_name,
        stored_name: file.stored_name,
        file_size: file.file_size,
        formatted_size: this.formatFileSize(file.file_size),
        mime_type: file.mime_type,
        file_extension: file.file_extension,
        category: file.category,
        description: file.description,
        is_public: file.is_public,
        access_count: file.access_count,
        created_at: file.created_at,
        last_accessed_at: file.last_accessed_at
      };

      res.json(Response.success(fileInfo, 'Informations fichier récupérées'));

    } catch (error) {
      logger.error('Erreur récupération informations fichier', {
        userId: req.user.id,
        fileId: req.params.fileId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des informations du fichier'));
    }
  }

  async deleteFile(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;

      logger.info('Suppression fichier demandée', { fileId, userId });

      const result = await fileService.deleteFile(fileId, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur suppression fichier', {
        userId: req.user.id,
        fileId: req.params.fileId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la suppression du fichier'));
    }
  }

  async getUserFiles(req, res) {
    try {
      const userId = req.user.id;
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        category: req.query.category,
        type: req.query.type
      };

      logger.debug('Récupération fichiers utilisateur', { userId, filters });

      const result = await fileService.getUserFiles(userId, filters);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur récupération fichiers utilisateur', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des fichiers'));
    }
  }

  async updateFileMetadata(req, res) {
    try {
      const { fileId } = req.params;
      const updates = req.body;
      const userId = req.user.id;

      logger.info('Mise à jour métadonnées fichier', { fileId, userId, updates });

      const result = await fileService.updateFileMetadata(fileId, updates, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur mise à jour métadonnées fichier', {
        userId: req.user.id,
        fileId: req.params.fileId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la mise à jour des métadonnées'));
    }
  }

  async getFileStats(req, res) {
    try {
      const userId = req.user.id;

      logger.debug('Récupération statistiques fichiers', { userId });

      const result = await fileService.getFileStats(userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur récupération statistiques fichiers', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des statistiques'));
    }
  }

  // Méthode helper pour formater la taille des fichiers
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new FileController();