import { Request, Response } from 'express';
import { createOrderService } from './orders.service';
import * as orderService from './orders.service';

export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    // 🚀 FIXED: Menangkap parameter paymentMethod dari request body frontend
    const { userId, courierCompany, courierName, shippingCost, cartItemIds, paymentMethod } = req.body;

    if (!userId || !courierCompany || !courierName || shippingCost === undefined || !Array.isArray(cartItemIds)) {
      res.status(400).json({
        success: false,
        message: "Gagal membuat order. Parameter userId, courierCompany, courierName, shippingCost, dan cartItemIds (Array) wajib diisi!"
      });
      return;
    }

    console.log(`==== [CREATING ORDER] ====`);
    console.log(`Memproses pembuatan Order ID untuk User: ${userId}`);

    // Meneruskan paymentMethod ke service (default ke 'MIDTRANS' jika kosong)
    const order = await createOrderService({
      userId,
      courierCompany,
      courierName,
      shippingCost: Number(shippingCost),
      cartItemIds,
      paymentMethod: paymentMethod || 'MIDTRANS'
    });

    res.status(201).json({
      success: true,
      message: "Pesanan berhasil dibuat! Keranjang otomatis dikosongkan.",
      data: order
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getUserOrdersHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string;

    const orders = await orderService.getUserOrdersHistoryService(userId);

    res.status(200).json({
      success: true,
      message: "Riwayat pesanan berhasil diambil.",
      data: orders
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const completeOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      res.status(400).json({ success: false, message: "Parameter orderId wajib diisi!" });
      return;
    }

    const updatedOrder = await orderService.completeOrderService(orderId);

    res.status(200).json({
      success: true,
      message: "Transaksi selesai! Terima kasih telah berbelanja di Online Grocery.",
      data: {
        orderId: updatedOrder.id,
        orderStatus: updatedOrder.status
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const prepareOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      res.status(400).json({ success: false, message: "Parameter orderId wajib dikirim oleh admin toko!" });
      return;
    }
    const updatedOrder = await orderService.prepareOrderService(orderId);
    res.status(200).json({
      success: true,
      message: "Sukses: Paket belanjaan mulai dikemas oleh tim gudang cabang!",
      data: updatedOrder
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const readyToShipOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      res.status(400).json({ success: false, message: "Parameter orderId wajib dikirim oleh admin toko!" });
      return;
    }
    const updatedOrder = await orderService.readyToShipOrderService(orderId);
    res.status(200).json({
      success: true,
      message: "Sukses: Paket selesai dikemas dan siap menunggu jemputan kurir!",
      data: updatedOrder
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const shipOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      res.status(400).json({ success: false, message: "Parameter orderId wajib dikirim oleh admin toko!" });
      return;
    }

    const updatedOrder = await orderService.shipOrderService(orderId);

    res.status(200).json({
      success: true,
      message: "Simulasi sukses: Paket belanjaan diserahkan ke jasa logistik kurir!",
      data: {
        orderId: updatedOrder.id,
        orderStatus: updatedOrder.status
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      res.status(400).json({ success: false, message: "Parameter orderId wajib diisi!" });
      return;
    }

    const updatedOrder = await orderService.cancelOrderService(orderId);

    res.status(200).json({
      success: true,
      message: "Pesanan Anda berhasil dibatalkan.",
      data: {
        orderId: updatedOrder.id,
        orderStatus: updatedOrder.status
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getOrderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    
    const order = await orderService.getOrderByIdService(id);

    if (!order) {
      res.status(404).json({
        success: false,
        message: "Waduh, detail invoice pesanan tidak ditemukan di database."
      });
      return;
    }

    const formattedOrder = {
      ...order,
      courierCompany: (order as any).shipping?.courier || '-',
      courierName: (order as any).shipping?.service || '-',
      biteshipTrackingUrl: (order as any).shipping?.resi ? `https://biteship.com/tracking/${(order as any).shipping.resi}` : null
    };

    res.status(200).json({
      success: true,
      message: "Detail nota belanja berhasil dimuat.",
      data: formattedOrder
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getAwaitingConfirmationOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const orders = await orderService.getAwaitingConfirmationOrdersService();
    res.status(200).json({
      success: true,
      message: "Antrean verifikasi pembayaran manual berhasil dimuat.",
      data: orders
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyManualPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, action } = req.body;

    if (!orderId || !action || !["APPROVE", "REJECT"].includes(action)) {
      res.status(400).json({
        success: false,
        message: "Parameter orderId dan action ('APPROVE' atau 'REJECT') wajib diisi dengan benar!"
      });
      return;
    }

    const updatedOrder = await orderService.verifyManualPaymentService({ orderId, action });
    res.status(200).json({
      success: true,
      message: action === "APPROVE" ? "Sukses: Pembayaran disetujui, pesanan diteruskan ke gudang!" : "Sukses: Pembayaran ditolak, pesanan dikembalikan ke konsumen.",
      data: updatedOrder
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};