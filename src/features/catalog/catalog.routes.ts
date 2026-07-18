import { Router } from 'express';
import * as catalogController from './catalog.controller';

const router = Router();

router.get('/stores/default-location', catalogController.getDefaultStoreLocation);
router.get('/stores', catalogController.getStores); // 🚀 JALUR BARU: Membuka gerbang publik untuk semua toko cabang
router.get('/categories', catalogController.getCategories);
router.get('/products/:slug', catalogController.getProductBySlug);
router.get('/products', catalogController.getProducts);

export default router;