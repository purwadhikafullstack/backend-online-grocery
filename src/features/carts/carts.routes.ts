import { Router } from 'express';
import * as cartController from './carts.controller';
import { authenticateUser, requireVerifiedUser } from '@/middlewares/auth.middleware';

const router = Router();

router.post('/', authenticateUser, requireVerifiedUser, cartController.addToCart);
router.get('/', authenticateUser, requireVerifiedUser, cartController.getUserCart);
router.patch('/:id', authenticateUser, requireVerifiedUser, cartController.updateCartItem);
router.delete('/:id', authenticateUser, requireVerifiedUser, cartController.deleteCartItem);

export default router;