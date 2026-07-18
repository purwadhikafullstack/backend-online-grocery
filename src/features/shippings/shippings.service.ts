import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BITESHIP_KEY = process.env.BITESHIP_API_KEY;
const BITESHIP_URL = 'https://api.biteship.com/v1/rates/couriers';

interface ShippingRequest {
  destLat: number;
  destLng: number;
  userId: string;
  storeId?: string; // 🚀 FIXED: Menambahkan tipe data storeId opsional di interface request
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface StoreBranch {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

// Algoritma Haversine untuk hitung jarak toko terdekat
const calculateDistance = (coords1: Coordinate, coords2: Coordinate): number => {
  const EARTH_RADIUS_KM = 6371; 
  const dLat = (coords2.latitude - coords1.latitude) * (Math.PI / 180);
  const dLng = (coords2.longitude - coords1.longitude) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coords1.latitude * (Math.PI / 180)) *
      Math.cos(coords2.latitude * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return EARTH_RADIUS_KM * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); 
};

const findNearestStore = (userCoords: Coordinate, stores: StoreBranch[]): StoreBranch | null => {
  if (stores.length === 0) return null;
  let nearestStore: StoreBranch | null = null;
  let shortestDistance = Infinity;

  stores.forEach((store) => {
    const distance = calculateDistance(userCoords, { latitude: store.latitude, longitude: store.longitude });
    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestStore = store;
    }
  });
  return nearestStore;
};

export const getBiteshipRates = async (data: ShippingRequest) => {
  let originLat = -6.222;
  let originLng = 106.649;

  // 🚀 FIXED BLOCK: Cek apakah frontend mengirimkan storeId pilihan user secara spesifik
  if (data.storeId) {
    const chosenStore = await prisma.store.findUnique({
      where: { id: data.storeId }
    });
    
    if (chosenStore) {
      originLat = Number(chosenStore.latitude);
      originLng = Number(chosenStore.longitude);
      console.log(`🎯 [SPECIFIC ORIGIN] Menggunakan Koordinat Cabang Pilihan User: ${chosenStore.name} (${originLat}, ${originLng})`);
    }
  } else {
    // Fallback cerdas: Jalankan Haversine hanya jika storeId tidak didefinisikan dari frontend
    const dbStores = await prisma.store.findMany();
    const storesForHaversine: StoreBranch[] = dbStores.map(store => ({
      id: store.id,
      name: store.name,
      latitude: Number(store.latitude),
      longitude: Number(store.longitude)
    }));

    const userLocation: Coordinate = { latitude: Number(data.destLat), longitude: Number(data.destLng) };
    const nearestStore = findNearestStore(userLocation, storesForHaversine);

    originLat = nearestStore ? nearestStore.latitude : -6.222;
    originLng = nearestStore ? nearestStore.longitude : 106.649;

    if (nearestStore) {
      console.log(`🎯 [DATABASE FALLBACK HAVERSINE] Toko Terdekat Otomatis: ${nearestStore.name}`);
    }
  }

  const userCart = await prisma.cart.findFirst({
    where: { userId: data.userId },
    include: { items: { include: { product: true } } }
  });

  let itemPayloads: any[] = [];

  if (userCart && userCart.items.length > 0) {
    userCart.items.forEach((item: any) => {
      const itemWeight = (item.product as any).weight || 200; 
      const itemPrice = item.priceSnapshot || item.product?.price || 25000;
      
      itemPayloads.push({
        name: item.product.name,
        description: item.product.description || 'Grocery Item',
        category: 'groceries',
        value: Number(itemPrice), 
        weight: Number(itemWeight) / 1000, 
        length: 10, width: 10, height: 10,
        quantity: Number(item.quantity)
      });
    });
  } else {
    throw new Error("Gagal mengecek ongkir: Keranjang belanja di database kosong!");
  }

  const payload = {
    origin_latitude: Number(originLat),
    origin_longitude: Number(originLng),
    destination_latitude: Number(data.destLat),
    destination_longitude: Number(data.destLng),
    couriers: 'gojek,grab',
    items: itemPayloads
  };

  try {
    const cleanToken = String(BITESHIP_KEY).trim();
    const response = await axios.post(BITESHIP_URL, payload, {
      headers: { 'Authorization': `Bearer ${cleanToken}`, 'Content-Type': 'application/json' }
    });

    const rawPricing = response.data.pricing || [];

    return rawPricing.map((item: any) => ({
      company: item.company,
      name: `${item.courier_name} - ${item.courier_service_name}`, 
      type: item.courier_service_code, 
      rate: Number(item.price), 
      description: item.description,
      duration: item.duration
    }));

  } catch (error: any) {
    console.error("❌ [BITESHIP API ERROR]:", error.response?.data || error.message);
    throw new Error("Gagal mendapatkan data kurir resmi dari server logistik Biteship.");
  }
};

// Admin Feature: Kirim barang & simpan nomor resi resmi
interface ShipOrderInput {
  orderId: string;
  resi: string;
}

export const shipOrderService = async (data: ShipOrderInput) => {
  const existingOrder = await prisma.order.findUnique({
    where: { id: data.orderId },
    include: { shipping: true }
  });

  if (!existingOrder || existingOrder.status !== "PROCESSING") {
    throw new Error("Pesanan tidak ditemukan atau tidak dalam status PROCESSING!");
  }

  return await prisma.$transaction(async (tx) => {
    const updatedShipping = await tx.shipping.update({
      where: { orderId: data.orderId },
      data: { resi: data.resi, status: "SHIPPED" }
    });

    const updatedOrder = await tx.order.update({
      where: { id: data.orderId },
      data: { status: "SHIPPED" }
    });

    return { orderStatus: updatedOrder.status, resi: updatedShipping.resi, shippingStatus: updatedShipping.status };
  }, { timeout: 20000 });
};