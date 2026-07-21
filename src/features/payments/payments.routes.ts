import { Router } from 'express';
import * as paymentController from './payments.controller';

const router = Router();

// POST /api/v1/payments/midtrans-notification (Automated Webhook)
router.post('/midtrans-notification', paymentController.handleMidtransNotification);

// POST /api/v1/payments/qris (Generate Midtrans Token)
router.post('/qris', paymentController.createQrisPayment);

export default router;