import { Router } from 'express';
import * as orderController from './orders.controller';

const router = Router();

router.post('/', orderController.createOrder);
router.get('/', orderController.getUserOrdersHistory);
router.patch('/complete', orderController.completeOrder);
router.patch('/cancel', orderController.cancelOrder);

router.patch('/prepare', orderController.prepareOrder);
router.patch('/ready-to-ship', orderController.readyToShipOrder);
router.patch('/ship', orderController.shipOrder);

router.get('/:id', orderController.getOrderById);

export default router;