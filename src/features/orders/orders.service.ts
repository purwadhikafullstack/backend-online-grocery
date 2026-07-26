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

export interface AdminOrdersFilterInput {
  storeId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

// 📌 1. Potong Stok Toko
export const reduceStoreStockService = async (orderId: string, tx: Prisma.TransactionClient) => {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });

  if (!order) throw new Error("Data pesanan tidak ditemukan untuk pemotongan stok!");

  for (const item of order.items) {
    const inventory = await tx.inventory.findFirst({
      where: {
        storeId: order.storeId,
        productId: item.productId,
      }
    });
    if (!inventory) {
      throw new Error(`Stok produk "${item.productName}" tidak terdaftar di toko cabang ini!`);
    }
    if (inventory.stock < item.quantity) {
      throw new Error(`Stok cabang tidak mencukupi untuk "${item.productName}". Tersisa: ${inventory.stock}, Dibeli: ${item.quantity}`);
    }

    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        stock: { decrement: item.quantity }
      }
    });
  }
};

// 📌 2. Kembalikan Stok Toko (Restore)
export const restoreStoreStockService = async (orderId: string, tx: Prisma.TransactionClient) => {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });

  if (!order) return;

  for (const item of order.items) {
    const inventory = await tx.inventory.findFirst({
      where: {
        storeId: order.storeId,
        productId: item.productId,
      }
    });

    if (inventory) {
      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          stock: { increment: item.quantity }
        }
      });
    }
  }
};

// 📌 3. Buat Order Baru & LANGSUNG Potong Stok Toko
export const createOrderService = async (data: CreateOrderInput) => {
  const userCart = await prisma.cart.findFirst({
    where: { userId: data.userId },
    include: {
      items: {
        where: { id: { in: data.cartItemIds } },
        include: { product: { include: { productImages: true } } }
      }
    }
  });

  if (!userCart || userCart.items.length === 0) {
    throw new Error("Keranjang belanja kosong atau item pilihan tidak valid, gagal membuat pesanan!");
  }

  const targetStoreId = userCart.items[0].storeId;
  const primaryAddress = await prisma.address.findFirst({
    where: { userId: data.userId, isPrimary: true, deletedAt: null }
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

    await tx.orderItem.createMany({ data: orderItemsData });
    await tx.cartItem.deleteMany({ where: { id: { in: data.cartItemIds } } });

    await reduceStoreStockService(newOrder.id, tx);

    return await tx.order.findUnique({
      where: { id: newOrder.id },
      include: { items: true, shipping: true }
    });
  }, { timeout: 20000 });
};

// 📌 4. Pembatalan Order (Aman dari Double-Execution & Type-Safe)
export const cancelOrderService = async (orderId: string) => {
  return await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: orderId,
        status: { in: ["WAITING_PAYMENT", "PROCESSING"] }
      },
      data: {
        status: "CANCELLED"
      }
    });

    if (updated.count === 0) {
      const existing = await tx.order.findUnique({ where: { id: orderId } });
      
      if (!existing) {
        throw new Error("Data pesanan (Order) tidak ditemukan!");
      }

      if (existing.status === "CANCELLED") {
        return existing;
      }

      throw new Error("Pesanan tidak dapat dibatalkan atau sudah masuk tahap pengiriman!");
    }

    await restoreStoreStockService(orderId, tx);

    const result = await tx.order.findUnique({
      where: { id: orderId }
    });

    if (!result) {
      throw new Error("Gagal mengambil data pesanan setelah dibatalkan.");
    }

    return result;
  });
};

// 📌 5. Auto-Cancel Pesanan Kadaluarsa Worker
export const cancelExpiredOrdersService = async () => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const expiredOrders = await prisma.order.findMany({
    where: {
      status: "WAITING_PAYMENT",
      createdAt: { lte: fiveMinutesAgo }
    }
  });

  for (const order of expiredOrders) {
    try {
      await cancelOrderService(order.id);
      console.log(`⏰ [Auto-Cancel] Order ID ${order.id} berhasil dibatalkan otomatis & stok dikembalikan.`);
    } catch (err) {
      console.error(`Gagal membatalkan order kadaluarsa ID ${order.id}:`, err);
    }
  }
};

// 📌 6. Ambil Pesanan Admin (Support Filtering: Store, Status, & Tanggal)
export const getAllAdminOrdersService = async (filters: AdminOrdersFilterInput = {}) => {
  const { storeId, status, startDate, endDate } = filters;
  const whereCondition: Prisma.OrderWhereInput = {};

  // Strict store filter validation
  if (
    storeId &&
    storeId !== 'ALL' &&
    storeId !== 'null' &&
    storeId !== 'undefined' &&
    storeId.trim() !== ''
  ) {
    whereCondition.storeId = storeId;
  }

  if (status && status !== 'ALL' && status.trim() !== '') {
    whereCondition.status = status as any;
  }

  if (startDate || endDate) {
    whereCondition.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      whereCondition.createdAt.gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereCondition.createdAt.lte = end;
    }
  }

  return await prisma.order.findMany({
    where: whereCondition,
    include: {
      items: { include: { product: true } },
      shipping: true,
      payment: true,
      store: { select: { id: true, name: true } }, // Fixed TS2353
      user: { select: { id: true, name: true, email: true } },
      address: true
    },
    orderBy: { createdAt: 'desc' }
  });
};

// 📌 7. Ambil Riwayat Order User
export const getUserOrdersHistoryService = async (userId: string) => {
  if (!userId) {
    throw new Error("Parameter userId wajib dilampirkan untuk melihat riwayat belanja!");
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const expiredOrders = await prisma.order.findMany({
    where: {
      userId,
      status: "WAITING_PAYMENT",
      createdAt: { lte: fiveMinutesAgo }
    }
  });

  for (const order of expiredOrders) {
    await cancelOrderService(order.id).catch(console.error);
  }

  return await prisma.order.findMany({
    where: { userId },
    include: { items: true, shipping: true, payment: true },
    orderBy: { createdAt: 'desc' }
  });
};

export const prepareOrderService = async (orderId: string) => {
  const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existingOrder) throw new Error("Data pesanan toko tidak ditemukan!");
  if (existingOrder.status !== "PROCESSING") throw new Error("Pesanan tidak bisa dikemas karena statusnya belum dibayar lunas!");
  return await prisma.order.update({ where: { id: orderId }, data: { status: "PREPARING" } });
};

export const readyToShipOrderService = async (orderId: string) => {
  const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existingOrder) throw new Error("Data pesanan toko tidak ditemukan!");
  if (existingOrder.status !== "PREPARING") throw new Error("Pesanan tidak bisa disiapkan sebelum selesai tahap pengemasan!");
  return await prisma.order.update({ where: { id: orderId }, data: { status: "READY_TO_SHIP" } });
};

export const shipOrderService = async (orderId: string) => {
  const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existingOrder) throw new Error("Data pesanan toko tidak ditemukan!");
  if (existingOrder.status !== "READY_TO_SHIP") throw new Error("Pesanan tidak bisa diserahkan ke kurir sebelum siap dipaketkan!");
  return await prisma.order.update({ where: { id: orderId }, data: { status: "SHIPPED" } });
};

export const completeOrderService = async (orderId: string) => {
  const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existingOrder) throw new Error("Data pesanan (Order) tidak ditemukan!");
  if (existingOrder.status !== "SHIPPED") throw new Error("Pesanan tidak dapat diselesaikan karena statusnya belum dikirim kurir!");
  return await prisma.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });
};

// 📌 8. Ambil Detail Order
export const getOrderByIdService = async (orderId: string) => {
  if (!orderId) throw new Error("orderId wajib disertakan untuk melihat detail nota!");
  
  let order = await prisma.order.findUnique({
    where: { id: orderId }, 
    include: { 
      items: { include: { product: true } }, 
      store: true,
      address: true,
      user: { select: { id: true, name: true, email: true } },
      shipping: { 
        include: { originStore: true, destinationAddress: true } 
      }, 
      payment: true 
    }
  });

  if (!order) return null;

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (order.status === "WAITING_PAYMENT" && new Date(order.createdAt) <= fiveMinutesAgo) {
    await cancelOrderService(order.id).catch(console.error);
    
    order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        items: { include: { product: true } }, 
        store: true,
        address: true,
        user: { select: { id: true, name: true, email: true } },
        shipping: { include: { originStore: true, destinationAddress: true } }, 
        payment: true 
      }
    });
  }

  return order;
};