const database = require('../config/database');
const logger = require('../utils/logger');
const { Response, Error, File, String } = require('../utils/helpers');
const constants = require('../utils/constants');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class FileService {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    this.bucketName = process.env.S3_BUCKET_NAME;
    this.table = 'files';
  }

  async uploadFile(file, userId, metadata = {}) {
    const uploadId = `upload_${userId}_${Date.now()}`;
    
    try {
      logger.info(`Upload fichier: ${uploadId}`, { 
        userId, 
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype 
      });

      // Validation du type de fichier
      const allowedTypes = Object.values(constants.UPLOAD.ALLOWED_MIME_TYPES).flat();
      if (!File.validateFileType(file.mimetype, allowedTypes)) {
        throw new Error('Type de fichier non autorisé');
      }

      // Validation de la taille
      if (file.size > constants.LIMITS.MAX_FILE_SIZE) {
        throw new Error(`Fichier trop volumineux. Maximum: ${constants.LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      // Générer un nom de fichier sécurisé
      const fileExtension = File.getFileExtension(file.originalname);
      const safeFilename = File.generateFilename(file.originalname, metadata.prefix || 'file');
      const s3Key = this.generateS3Key(metadata.category || 'general', safeFilename);

      // Upload vers S3
      const uploadParams = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
        Metadata: {
          uploadedBy: userId,
          originalName: file.originalname,
          category: metadata.category || 'general'
        }
      };

      await this.s3Client.send(new PutObjectCommand(uploadParams));

      // Enregistrer en base de données
      const fileRecord = {
        user_id: userId,
        original_name: file.originalname,
        stored_name: safeFilename,
        file_path: s3Key,
        file_size: file.size,
        mime_type: file.mimetype,
        file_extension: fileExtension,
        category: metadata.category || 'general',
        description: metadata.description || '',
        is_public: metadata.is_public || false,
        metadata: {
          uploadId,
          s3Bucket: this.bucketName,
          s3Key: s3Key,
          ...metadata
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = await database.safeInsert(this.table, fileRecord);

      logger.info(`Fichier uploadé avec succès: ${uploadId}`, {
        fileId: result.id,
        s3Key,
        userId
      });

      return Response.success(result, 'Fichier uploadé avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'FileService.uploadFile', {
        uploadId,
        userId,
        fileInfo: {
          name: file?.originalname,
          size: file?.size,
          type: file?.mimetype
        }
      });
      
      logger.error(`Échec upload fichier: ${uploadId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async getFileUrl(fileId, userId) {
    try {
      logger.debug(`Génération URL fichier: ${fileId}`, { userId });

      const file = await database.safeSelect(
        this.table,
        { id: fileId },
        { single: true }
      );

      if (!file) {
        throw new Error('Fichier non trouvé');
      }

      // Vérifier les permissions
      if (!file.is_public && file.user_id !== userId) {
        throw new Error('Accès non autorisé à ce fichier');
      }

      // Générer une URL signée pour S3
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: file.file_path
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { 
        expiresIn: 3600 // 1 heure
      });

      // Mettre à jour le compteur d'accès
      await database.safeUpdate(
        this.table,
        {
          access_count: database.client.raw('access_count + 1'),
          last_accessed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { id: fileId }
      );

      const fileInfo = {
        id: file.id,
        original_name: file.original_name,
        file_size: file.file_size,
        mime_type: file.mime_type,
        download_url: signedUrl,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
      };

      return Response.success(fileInfo, 'URL de téléchargement générée');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'FileService.getFileUrl', {
        fileId,
        userId
      });
      
      return Response.error(handledError.message);
    }
  }

  async deleteFile(fileId, userId) {
    const deleteId = `delete_${fileId}_${Date.now()}`;
    
    try {
      logger.info(`Suppression fichier: ${deleteId}`, { fileId, userId });

      const file = await database.safeSelect(
        this.table,
        { id: fileId },
        { single: true }
      );

      if (!file) {
        throw new Error('Fichier non trouvé');
      }

      // Vérifier les permissions
      if (file.user_id !== userId) {
        throw new Error('Non autorisé à supprimer ce fichier');
      }
// Vérifier les permissions
      if (file.user_id !== userId) {
        throw new Error('Non autorisé à supprimer ce fichier');
      }

      // Supprimer de S3
      try {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: file.file_path
        }));
      } catch (s3Error) {
        logger.warn('Erreur suppression S3, continuation suppression DB', {
          fileId,
          error: s3Error.message
        });
      }

      // Supprimer de la base de données
      await database.safeDelete(this.table, { id: fileId });

      logger.info(`Fichier supprimé: ${deleteId}`, {
        fileId,
        userId,
        filePath: file.file_path
      });

      return Response.success(null, 'Fichier supprimé avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'FileService.deleteFile', {
        deleteId,
        fileId,
        userId
      });
      
      logger.error(`Échec suppression fichier: ${deleteId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async getUserFiles(userId, filters = {}) {
    try {
      const { 
        page = 1, 
        limit = constants.LIMITS.DEFAULT_PAGE_LIMIT, 
        category,
        type 
      } = filters;

      const offset = (page - 1) * limit;

      let query = database.client
        .from(this.table)
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      if (type) {
        const mimeCategory = File.getMimeCategory(type);
        if (mimeCategory !== 'other') {
          query = query.like('mime_type', `${mimeCategory}%`);
        }
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      };

      return Response.paginated(data, pagination, 'Fichiers récupérés avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'FileService.getUserFiles', {
        userId,
        filters
      });
      
      return Response.error(handledError.message);
    }
  }

  async updateFileMetadata(fileId, updates, userId) {
    try {
      logger.debug(`Mise à jour métadonnées fichier: ${fileId}`, { userId, updates });

      const file = await database.safeSelect(
        this.table,
        { id: fileId },
        { single: true }
      );

      if (!file) {
        throw new Error('Fichier non trouvé');
      }

      if (file.user_id !== userId) {
        throw new Error('Non autorisé à modifier ce fichier');
      }

      const allowedUpdates = ['description', 'category', 'is_public'];
      const cleanUpdates = {};
      
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          cleanUpdates[key] = updates[key];
        }
      });
