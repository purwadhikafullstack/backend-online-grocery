import { Router } from 'express';
import * as paymentController from './payments.controller';

const router = Router();

router.post('/midtrans-notification', paymentController.handleMidtransNotification);
router.post('/qris', paymentController.createQrisPayment);

export default router;