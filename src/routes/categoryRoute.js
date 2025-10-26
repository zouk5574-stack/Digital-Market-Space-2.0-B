// src/routes/categoryRoute.js
import express from 'express';
import {
  getCategories,
  createCategory,
  updateCategory
} from '../controllers/categoryController.js';

const router = express.Router();

router.get('/', getCategories);
router.post('/', createCategory);
router.put('/:id', updateCategory);

export default router;
