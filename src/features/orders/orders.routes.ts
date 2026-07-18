import { Router } from 'express';
import * as orderController from './orders.controller';
import { getOrderById } from './orders.controller';

const router = Router();

// Rute Bawaan Kelompok (Aman)
router.post('/', orderController.createOrder);
router.get('/', orderController.getUserOrdersHistory);
router.patch('/complete', orderController.completeOrder);
router.patch('/cancel', orderController.cancelOrder);

// 🚀 FITUR LOGISTIK BARU ADMIN PENGELOLA TOKO CABANG
router.patch('/prepare', orderController.prepareOrder);       // Poin 6: Admin klik "Mulai Kemas Paket" (PROCESSING -> PREPARING)
router.patch('/ready-to-ship', orderController.readyToShipOrder); // Poin 6: Admin klik "Selesai Dikemas - Menunggu Kurir" (PREPARING -> READY_TO_SHIP)
router.patch('/ship', orderController.shipOrder);             // Poin 6: Admin klik "Serahkan ke Kurir" (READY_TO_SHIP -> SHIPPED)

// Rute Bawaan Detail Nota (Aman)
router.get('/:id', getOrderById);

export default router;