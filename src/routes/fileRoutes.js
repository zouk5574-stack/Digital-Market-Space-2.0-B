// src/routes/fileRoutes.js
import express from 'express';
import {
  uploadFile,
  getProductFiles,
  deleteFile
} from '../controllers/fileController.js';

const router = express.Router();

router.post('/upload', uploadFile);
router.get('/product/:product_id', getProductFiles);
router.delete('/:id', deleteFile);

export default router;
