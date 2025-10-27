const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { validateFileUpload } = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Upload de fichiers
router.post('/upload',
  authMiddleware.authenticateToken,
  upload.single('file'),
  validateFileUpload(['image/jpeg', 'image/png', 'application/pdf', 'application/zip']),
  fileController.uploadFile
);

router.post('/upload-multiple',
  authMiddleware.authenticateToken,
  upload.array('files', 5),
  validateFileUpload(['image/jpeg', 'image/png', 'application/pdf', 'application/zip']),
  fileController.uploadMultipleFiles
);

// Gestion des fichiers
router.get('/',
  authMiddleware.authenticateToken,
  fileController.getUserFiles
);

router.get('/:fileId',
  authMiddleware.authenticateToken,
  fileController.getFileInfo
);

router.get('/:fileId/download',
  authMiddleware.authenticateToken,
  fileController.downloadFile
);

router.put('/:fileId',
  authMiddleware.authenticateToken,
  fileController.updateFileMetadata
);

router.delete('/:fileId',
  authMiddleware.authenticateToken,
  fileController.deleteFile
);

// Statistiques fichiers
router.get('/stats',
  authMiddleware.authenticateToken,
  fileController.getFileStats
);

module.exports = router;