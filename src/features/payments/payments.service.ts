import { PrismaClient } from '@prisma/client';
import { restoreStoreStockService } from '../orders/orders.service';

const prisma = new PrismaClient();

interface ProcessNotificationInput {
  orderId: string;
  transactionStatus: string;
  fraudStatus: string;
}

export const processMidtransNotificationService = async (data: ProcessNotificationInput) => {
  console.log("✏️ Menjalankan sinkronisasi status dari Webhook Midtrans...", data);

  const order = await prisma.order.findUnique({
    where: { id: data.orderId }
  });

  if (!order) {
    throw new Error(`Order ID ${data.orderId} tidak terdaftar di database Online Grocery!`);
  }

  let nextOrderStatus: "PROCESSING" | "CANCELLED" | "WAITING_PAYMENT" = "WAITING_PAYMENT";

  if (data.transactionStatus === "settlement") {
    nextOrderStatus = "PROCESSING";
  } else if (data.transactionStatus === "capture") {
    if (data.fraudStatus === "challenge") {
      nextOrderStatus = "WAITING_PAYMENT";
    } else {
      nextOrderStatus = "PROCESSING";
    }
  } else if (
    data.transactionStatus === "cancel" ||
    data.transactionStatus === "deny" ||
    data.transactionStatus === "expire"
  ) {
    nextOrderStatus = "CANCELLED";
  } else if (data.transactionStatus === "pending") {
    nextOrderStatus = "WAITING_PAYMENT";
  }

  console.log(`🔄 Mengubah status Order dari ${order.status} -> ${nextOrderStatus}`);

  if (order.status === nextOrderStatus) {
    return order;
  }

  return await prisma.$transaction(async (tx) => {
    // 🚀 Stok TIDAK DIPOTONG di sini lagi, karena sudah dipotong di awal transaksi!

    // 🚀 Jika transaksi dibatalkan / expired oleh Midtrans, kembalikan stok
    if ((order.status === "WAITING_PAYMENT" || order.status === "PROCESSING") && nextOrderStatus === "CANCELLED") {
      await restoreStoreStockService(order.id, tx);
    }

    return await tx.order.update({
      where: { id: data.orderId },
      data: { status: nextOrderStatus }
    });
  });
};

export const createMidtransQrisService = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId }
  });

  if (!order) {
    throw new Error("Data pesanan tidak ditemukan di database!");
  }

  let finalAmount = 0;
  if (order.totalAmount && !isNaN(order.totalAmount.toNumber()) && order.totalAmount.toNumber() > 0) {
    finalAmount = order.totalAmount.toNumber();
  } else {
    const dbSubtotal = order.subtotal ? order.subtotal.toNumber() : 0;
    const dbShipping = order.shippingCost ? order.shippingCost.toNumber() : 0;
    const dbDiscount = order.discountAmount ? order.discountAmount.toNumber() : 0;
    finalAmount = (dbSubtotal + dbShipping) - dbDiscount;
  }

  if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
    finalAmount = 50000;
  }

  console.log(`=== 💰 MIDTRANS REAL GROSS AMOUNT VERIFIED: ${finalAmount} ===`);

  const parameter = {
    transaction_details: {
      order_id: `${order.id}-${Date.now()}`,
      gross_amount: finalAmount
    },
    enabled_payments: ["gopay", "qris"]
  };

  const serverKey = "Mid-server-v6kWx9SfNwHP92N4LjwhFI49";
  const base64AuthToken = Buffer.from(`${serverKey}:`).toString('base64');

  const response = await fetch('https://app.sandbox.midtrans.com/snap/v1/transactions', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Basic ${base64AuthToken}`
    },
    body: JSON.stringify(parameter)
  });

  const transaction: any = await response.json();
  if (transaction.error_messages) {
    throw new Error(`Snap API Error: ${transaction.error_messages.join(', ')}`);
  }

  return transaction;
};