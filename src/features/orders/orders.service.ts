import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface CreateOrderInput {
  userId: string;
  courierCompany: string;
  courierName: string;
  shippingCost: number;
  cartItemIds: string[];
  paymentMethod: string;
}

export const createOrderService = async (data: CreateOrderInput) => {
  const userCart = await prisma.cart.findFirst({
    where: { userId: data.userId },
    include: {
      items: {
        where: {
          id: { in: data.cartItemIds }
        },
        include: {
          product: {
            include: {
              productImages: true
            }
          }
        }
      }
    }
  });

  if (!userCart || userCart.items.length === 0) {
    throw new Error("Keranjang belanja kosong atau item pilihan tidak valid, gagal membuat pesanan!");
  }

  const targetStoreId = userCart.items[0].storeId;

  const primaryAddress = await prisma.address.findFirst({
    where: {
      userId: data.userId,
      isPrimary: true,
      deletedAt: null
    }
  });

  if (!primaryAddress) {
    throw new Error("Gagal membuat pesanan. User belum memiliki alamat utama!");
  }

  let totalProductPrice = 0;
  userCart.items.forEach((item) => {
    const currentPrice = Number(item.priceSnapshot) || Number(item.product.price);
    totalProductPrice += currentPrice * item.quantity;
  });

  const grandTotal = totalProductPrice + Number(data.shippingCost);

  return await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        user: { connect: { id: data.userId } },
        address: { connect: { id: primaryAddress.id } },
        store: { connect: { id: targetStoreId } },
        subtotal: new Prisma.Decimal(totalProductPrice),
        shippingCost: new Prisma.Decimal(data.shippingCost),
        totalAmount: new Prisma.Decimal(grandTotal),
        notes: data.paymentMethod
      }
    });

    await tx.shipping.create({
      data: {
        order: { connect: { id: newOrder.id } },
        courier: data.courierCompany,
        service: data.courierName,
        shippingCost: new Prisma.Decimal(data.shippingCost),
        originStore: { connect: { id: targetStoreId } },
        destinationAddress: { connect: { id: primaryAddress.id } }
      }
    });

    const orderItemsData = userCart.items.map((item) => {
      const itemPrice = Number(item.priceSnapshot) || Number(item.product.price);
      const itemSubtotal = itemPrice * item.quantity;
      
      return {
        orderId: newOrder.id,
        productId: item.productId,
        productName: item.product?.name || "Grocery Item",
        quantity: item.quantity,
        priceSnapshot: new Prisma.Decimal(itemPrice),
        subtotal: new Prisma.Decimal(itemSubtotal)
      };
    });

    await tx.orderItem.createMany({
      data: orderItemsData
    });

    await tx.cartItem.deleteMany({
      where: {
        id: { in: data.cartItemIds }
      }
    });

    return await tx.order.findUnique({
      where: { id: newOrder.id },
      include: { items: true, shipping: true }
    });
  }, {
    timeout: 20000
  });
};

export const getUserOrdersHistoryService = async (userId: string) => {
  if (!userId) {
    throw new Error("userId wajib disertakan untuk melihat riwayat!");
  }

  return await prisma.order.findMany({
    where: { userId },
    include: {
      items: {
        include: {
          product: true
        }
      },
      shipping: true,
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
};

export const prepareOrderService = async (orderId: string) => {
  const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existingOrder) throw new Error("Data pesanan toko tidak ditemukan!");
  if (existingOrder.status !== "PROCESSING") throw new Error("Pesanan tidak bisa dikemas karena statusnya belum dibayar lunas!");

  return await prisma.order.update({
    where: { id: orderId },
    data: { status: "PREPARING" }
  });
};

export const readyToShipOrderService = async (orderId: string) => {
  const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existingOrder) throw new Error("Data pesanan toko tidak ditemukan!");
  if (existingOrder.status !== "PREPARING") throw new Error("Pesanan tidak bisa disiapkan sebelum selesai tahap pengemasan!");

  return await prisma.order.update({
    where: { id: orderId },
    data: { status: "READY_TO_SHIP" }
  });
};

export const shipOrderService = async (orderId: string) => {
  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId }
  });

  if (!existingOrder) {
    throw new Error("Data pesanan toko tidak ditemukan!");
  }

  if (existingOrder.status !== "READY_TO_SHIP") throw new Error("Pesanan tidak bisa diserahkan ke kurir sebelum siap dipaketkan!");

  return await prisma.order.update({
    where: { id: orderId },
    data: { status: "SHIPPED" }
  });
};

export const completeOrderService = async (orderId: string) => {
  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId }
  });

  if (!existingOrder) {
    throw new Error("Data pesanan (Order) tidak ditemukan!");
  }

  if (existingOrder.status !== "SHIPPED") {
    throw new Error("Pesanan tidak dapat diselesaikan karena statusnya belum dikirim kurir!");
  }

  return await prisma.order.update({
    where: { id: orderId },
    data: { status: "DELIVERED" }
  });
};

export const cancelOrderService = async (orderId: string) => {
  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId }
  });

  if (!existingOrder) {
    throw new Error("Data pesanan (Order) tidak ditemukan!");
  }

  const allowedCancelStatuses = ["WAITING_PAYMENT", "PROCESSING"];
  if (!allowedCancelStatuses.includes(existingOrder.status)) {
    throw new Error("Pesanan tidak dapat dibatalkan karena sudah masuk tahap gudang/pengiriman!");
  }

  return await prisma.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED" }
  });
};

export const getOrderByIdService = async (orderId: string) => {
  if (!orderId) {
    throw new Error("orderId wajib disertakan untuk melihat detail nota!");
  }

  // 🚀 FIXED: query diubah dari 'orderId' menjadi 'id' sesuai PK skema prisma lo
  return await prisma.order.findUnique({
    where: { id: orderId }, 
    include: {
      items: {
        include: {
          product: true
        }
      },
      shipping: true,
      payment: true
    }
  });
};

export const getAwaitingConfirmationOrdersService = async () => {
  return await prisma.order.findMany({
    where: {
      status: "WAITING_CONFIRMATION"
    },
    include: {
      user: true,
      payment: true,
      shipping: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
};

interface VerifyPaymentInput {
  orderId: string;
  action: "APPROVE" | "REJECT";
}

export const verifyManualPaymentService = async (data: VerifyPaymentInput) => {
  const existingOrder = await prisma.order.findUnique({
    where: { id: data.orderId },
    include: { payment: true }
  });

  if (!existingOrder) {
    throw new Error("Data pesanan tidak ditemukan di database!");
  }

  if (existingOrder.status !== "WAITING_CONFIRMATION") {
    throw new Error("Pesanan tidak sedang dalam antrean verifikasi pembayaran manual!");
  }

  return await prisma.$transaction(async (tx) => {
    if (data.action === "APPROVE") {
      await tx.payment.update({
        where: { orderId: data.orderId },
        data: { status: "APPROVED" }
      });

      return await tx.order.update({
        where: { id: data.orderId },
        data: { status: "PROCESSING" }
      });
    } else {
      await tx.payment.update({
        where: { orderId: data.orderId },
        data: { status: "REJECTED" }
      });

      return await tx.order.update({
        where: { id: data.orderId },
        data: { status: "WAITING_PAYMENT" }
      });
    }
  }, { timeout: 15000 });
};