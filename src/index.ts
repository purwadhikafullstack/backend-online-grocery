import { cancelExpiredOrdersService } from './features/orders/orders.service';

// 🔄 Auto-Cancel Worker: Berjalan setiap 60 detik (1 menit)
setInterval(async () => {
  try {
    await cancelExpiredOrdersService();
  } catch (error) {
    console.error("Gagal menjalankan Auto-Cancel Worker:", error);
  }
}, 60 * 1000);