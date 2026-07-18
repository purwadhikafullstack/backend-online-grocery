import { Request, Response } from 'express';
import * as cartService from './carts.service';

export const addToCart = async (req: Request, res: Response): Promise<void> => {
  try {
    // 🎯 DINAMIS: Ambil ID user aktif secara real-time dari payload token JWT via middleware
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ message: "Sesi Anda tidak valid atau telah berakhir." });
      return;
    }

    const { productId, storeId, quantity } = req.body;
    const item = await cartService.addToCartService(userId, productId, storeId, Number(quantity)); // [source: 5]
    res.status(200).json({ message: "Barang berhasil masuk keranjang", data: item }); // [source: 5]
  } catch (error: any) {
    res.status(500).json({ message: error.message }); // [source: 5]
  }
};

export const updateCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string; // [source: 5]
    const { quantity } = req.body; // [source: 5]
    const updated = await cartService.updateCartItemQtyService(id, Number(quantity)); // [source: 5]
    res.status(200).json({ message: "Jumlah item diperbarui", data: updated }); // [source: 5]
  } catch (error: any) {
    res.status(500).json({ message: error.message }); // [source: 5]
  }
};

export const deleteCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string; // [source: 5]
    await cartService.deleteCartItemService(id); // [source: 5]
    res.status(200).json({ message: "Item dihapus dari keranjang" }); // [source: 5]
  } catch (error: any) {
    res.status(500).json({ message: error.message }); // [source: 5]
  }
};

export const getUserCart = async (req: Request, res: Response): Promise<void> => {
  try {
    // 🎯 DINAMIS: Ambil ID user aktif secara real-time dari payload token JWT via middleware
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ message: "Gagal mengambil data, silakan login ulang." });
      return;
    }

    const cartData = await cartService.getUserCartService(userId); // [source: 5]
    res.status(200).json(cartData || { items: [] }); // [source: 5]
  } catch (error: any) {
    res.status(500).json({ message: error.message }); // [source: 5]
  }
};