import { Request, Response } from 'express';
import * as paymentService from './payments.service';

export const handleMidtransNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("=== ISI REQ.BODY ASLI DARI POSTMAN DENGAN UUID ===", req.body);
    const rawOrderId = req.body.order_id as string; 
    
    let cleanOrderId = rawOrderId;
    if (rawOrderId && rawOrderId.length > 36) {
      const lastDashIndex = rawOrderId.lastIndexOf('-');
      cleanOrderId = rawOrderId.substring(0, lastDashIndex);
    }

    console.log(`🧹 Hasil Pembersihan ID Pesanan: ${cleanOrderId}`);

    const result = await paymentService.processMidtransNotificationService({
      orderId: cleanOrderId,                         
      transactionStatus: req.body.transaction_status, 
      fraudStatus: req.body.fraud_status       
    });

    res.status(200).json({
      success: true,
      message: "Webhook Midtrans berhasil diproses otomatis!",
      data: result
    });
  } catch (error: any) {
    console.error("Gagal memproses webhook Midtrans:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createQrisPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      res.status(400).json({ success: false, message: "orderId wajib dikirim!" });
      return;
    }
    const result = await paymentService.createMidtransQrisService(orderId);
    res.status(200).json({
      success: true,
      message: "Berhasil membuat QR Code pembayaran Midtrans!",
      data: result
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};