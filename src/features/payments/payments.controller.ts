import { Request, Response } from 'express';
import * as paymentService from './payments.service';

export const confirmPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, amount, bankName, accountNumber, proofUrl } = req.body;

    if (!orderId || !amount || !proofUrl) {
       res.status(400).json({ 
        success: false, 
        message: "Properti orderId, amount, dan proofUrl wajib diisi!" 
      });
       return;
    }

    const result = await paymentService.confirmPaymentService({
      orderId,
      amount: Number(amount),
      bankName,
      accountNumber,
      proofUrl
    });

    res.status(201).json({
      success: true,
      message: "Bukti pembayaran berhasil diunggah! Menunggu konfirmasi admin.",
      data: result
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

export const approvePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      res.status(400).json({ success: false, message: "paymentId wajib dikirim!" });
      return;
    }

    const result = await paymentService.approvePaymentService(paymentId);

    res.status(200).json({
      success: true,
      message: "Pembayaran berhasil disetujui! Pesanan siap diproses gudang.",
      data: result
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const handleMidtransNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("=== ISI REQ.BODY ASLI DARI POSTMAN DENGAN UUID ===", req.body);

    const rawOrderId = req.body.order_id as string; //
    
    // 🚀 FIXED LOGIC: Panjang standar UUID v4 adalah 36 karakter (termasuk strip bawaan).
    // - Jika panjangnya lebih dari 36, berarti ada tambahan nomor acak dari Midtrans (e.g., UUID-1710000000)
    // - Kita cari posisi strip paling terakhir untuk memotong suffix tersebut dengan aman tanpa merusak UUID!
    let cleanOrderId = rawOrderId;
    if (rawOrderId && rawOrderId.length > 36) {
      const lastDashIndex = rawOrderId.lastIndexOf('-');
      cleanOrderId = rawOrderId.substring(0, lastDashIndex);
    }

    console.log(`🧹 Hasil Pembersihan ID Pesanan: ${cleanOrderId}`);

    const result = await paymentService.processMidtransNotificationService({
      orderId: cleanOrderId,                          // 👈 Menggunakan ID asli UUID yang utuh dan bersih
      transactionStatus: req.body.transaction_status, //
      fraudStatus: req.body.fraud_status       //[cite: 8]
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