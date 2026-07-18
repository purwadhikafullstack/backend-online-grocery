import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper untuk mengambil atau membuat Cart aktif milik User
export const getOrCreateCart = async (userId: string) => {
  const existingCart = await prisma.cart.findFirst({ where: { userId } });
  if (existingCart) return existingCart;
  return await prisma.cart.create({ data: { userId } });
};

// Feature: Add to Cart & Update Quantity jika barang sudah ada (DENGAN VALIDASI STOK ASLI)
export const addToCartService = async (userId: string, productId: string, storeId: string, quantity: number) => {
  // 🎯 DIBIKIN DINAMIS: Mengambil stok asli dari cabang toko yang bersangkutan di tabel inventory
  const stockRecord = await prisma.inventory.findFirst({ where: { productId, storeId } });
  const availableStock = stockRecord ? stockRecord.stock : 0;
  
  const cart = await getOrCreateCart(userId);
  const existingItem = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId, storeId }
  });

  const currentCartQty = existingItem ? existingItem.quantity : 0;
  const totalRequestedQty = currentCartQty + quantity;

  // Validasi stok asli berjalan 100% real-time
  if (availableStock <= 0 || totalRequestedQty > availableStock) {
    throw new Error(`Stok produk tidak mencukupi di cabang ini. Stok tersedia: ${availableStock}`);
  }

  const product = await prisma.product.findUnique({ 
    where: { id: productId },
    select: {
      id: true,
      price: true,
      name: true
    }
  });
  
  const priceSnapshot = product?.price || 0;

  return await prisma.cartItem.upsert({
    where: { cartId_productId_storeId: { cartId: cart.id, productId, storeId } },
    update: { quantity: { increment: quantity } },
    create: { cartId: cart.id, productId, storeId, quantity, priceSnapshot }
  });
};

// Feature: Update Qty Langsung (lewat input angka atau klik + / -) dengan Validasi Stok Asli
export const updateCartItemQtyService = async (id: string, quantity: number) => {
  if (quantity <= 0) return await prisma.cartItem.delete({ where: { id } });

  const item = await prisma.cartItem.findUnique({ where: { id } });
  if (!item) throw new Error("Item keranjang tidak ditemukan");

  // 🎯 DIBIKIN DINAMIS: Proteksi stok gudang saat user klik tombol + di halaman keranjang belanja
  const stockRecord = await prisma.inventory.findFirst({ where: { productId: item.productId, storeId: item.storeId } });
  const availableStock = stockRecord ? stockRecord.stock : 0;

  if (quantity > availableStock) {
    throw new Error(`Waduh, tidak bisa menambah barang. Stok di gudang toko hanya sisa ${availableStock} item.`);
  }

  return await prisma.cartItem.update({ where: { id }, data: { quantity } });
};

// Feature: Remove Item dari Cart
export const deleteCartItemService = async (id: string) => {
  return await prisma.cartItem.delete({ where: { id } });
};

// Feature: Get Cart Data untuk List Tampilan User (100% DINAMIS & AMBIL STOK GUDANG)
export const getUserCartService = async (userId: string) => {
  // 1. Ambil data dasar keranjang belanja milik user
  const cart = await prisma.cart.findFirst({
    where: { userId },
    include: {
      items: {
        include: {
          store: true,
          product: {
            include: {
              productImages: true,
            }
          }
        }
      }
    }
  });

  if (!cart || !cart.items) return cart;

  // 2. 🚀 PROSES MAP DINAMIS: Menyisir dan menyuntikkan data stok real-time dari cabang toko terkait
  const itemsWithLiveStock = await Promise.all(
    cart.items.map(async (item) => {
      const inventoryRecord = await prisma.inventory.findFirst({
        where: {
          productId: item.productId,
          storeId: item.storeId
        }
      });

      return {
        ...item,
        product: {
          ...item.product,
          stock: inventoryRecord ? inventoryRecord.stock : 0 // 🎯 Menyisipkan properti stock agar terbaca oleh frontend
        }
      };
    })
  );

  return {
    ...cart,
    items: itemsWithLiveStock
  };
};