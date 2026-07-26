import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getOrCreateCart = async (userId: string) => {
  const existingCart = await prisma.cart.findFirst({ where: { userId } });
  if (existingCart) return existingCart;
  return await prisma.cart.create({ data: { userId } });
};

export const addToCartService = async (userId: string, productId: string, storeId: string, quantity: number) => {
  const stockRecord = await prisma.inventory.findFirst({ where: { productId, storeId } });
  const availableStock = stockRecord ? stockRecord.stock : 0;
  
  const cart = await getOrCreateCart(userId);
  const existingItem = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId, storeId }
  });

  const currentCartQty = existingItem ? existingItem.quantity : 0;
  const totalRequestedQty = currentCartQty + quantity;

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

export const updateCartItemQtyService = async (id: string, quantity: number) => {
  if (quantity <= 0) return await prisma.cartItem.delete({ where: { id } });

  const item = await prisma.cartItem.findUnique({ where: { id } });
  if (!item) throw new Error("Item keranjang tidak ditemukan");

  const stockRecord = await prisma.inventory.findFirst({ where: { productId: item.productId, storeId: item.storeId } });
  const availableStock = stockRecord ? stockRecord.stock : 0;

  if (quantity > availableStock) {
    throw new Error(`Waduh, tidak bisa menambah barang. Stok di gudang toko hanya sisa ${availableStock} item.`);
  }

  return await prisma.cartItem.update({ where: { id }, data: { quantity } });
};

export const deleteCartItemService = async (id: string) => {
  return await prisma.cartItem.delete({ where: { id } });
};

export const getUserCartService = async (userId: string) => {
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
          stock: inventoryRecord ? inventoryRecord.stock : 0
        }
      };
    })
  );

  return {
    ...cart,
    items: itemsWithLiveStock
  };
};