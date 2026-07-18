import { Router } from 'express';
import * as cartController from './carts.controller';
// 🎯 IMPORT: Ambil satpam middleware auth kelompok lo
import { authenticateUser, requireVerifiedUser } from '@/middlewares/auth.middleware';

const router = Router();

// 🚀 PROTEKSI: Sekarang semua rute keranjang wajib lolos token JWT dan verifikasi email dahulu
router.post('/', authenticateUser, requireVerifiedUser, cartController.addToCart);         // POST /api/carts
router.get('/', authenticateUser, requireVerifiedUser, cartController.getUserCart);        // GET /api/carts
router.patch('/:id', authenticateUser, requireVerifiedUser, cartController.updateCartItem); // PATCH /api/carts/:id
router.delete('/:id', authenticateUser, requireVerifiedUser, cartController.deleteCartItem); // DELETE /api/carts/:id

export default router;