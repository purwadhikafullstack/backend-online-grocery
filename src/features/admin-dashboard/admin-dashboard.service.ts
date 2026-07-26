import { Prisma } from '@prisma/client';
import { prisma } from '@/application/database';
import { assertAdminUser, resolveReadableStores } from '@/features/admin/admin-access';

type UserPayload = { id: string; role: string };
type OrderScope = Prisma.OrderWhereInput;
type TrendRow = { date: string; revenue: number; orders: number };
type ProductGroup = { name: string; imageUrl: string | null; quantity: number; revenue: number };

export const getDashboard = async (rawUser: UserPayload | undefined) => {
  const user = assertAdminUser(rawUser);
  const storeIds = await resolveReadableStores(user);
  const scope = orderScope(storeIds);
  const [metrics, revenueTrend, topProducts, salesByCategory] = await Promise.all([
    getMetrics(scope),
    getRevenueTrend(scope),
    getTopProducts(scope),
    getSalesByCategory(scope),
  ]);
  return { metrics, revenueTrend, topProducts, salesByCategory };
};

const orderScope = (storeIds?: string[]): OrderScope => ({
  status: { not: 'CANCELLED' },
  ...(storeIds ? { storeId: storeIds.length ? { in: storeIds } : '__no_access__' } : {}),
});

const getMetrics = async (where: OrderScope) => {
  const [aggregate, activeCustomers] = await Promise.all([
    prisma.order.aggregate({ where, _sum: { totalAmount: true }, _count: { id: true } }),
    prisma.order.findMany({ where, distinct: ['userId'], select: { userId: true } }),
  ]);
  const totalRevenue = Number(aggregate._sum.totalAmount ?? 0);
  const totalOrders = aggregate._count.id;
  return {
    totalRevenue,
    totalOrders,
    averageOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
    activeCustomers: activeCustomers.length,
  };
};

const getRevenueTrend = async (where: OrderScope) => {
  const start = startDate();
  const rows = await prisma.order.findMany({
    where: { ...where, createdAt: { gte: start } },
    select: { createdAt: true, totalAmount: true },
    orderBy: { createdAt: 'asc' },
  });
  const trend = seedTrend(start);
  rows.forEach((row) => {
    const key = dateKey(row.createdAt);
    const item = trend.get(key);
    if (item) {
      item.revenue += Number(row.totalAmount);
      item.orders += 1;
    }
  });
  return Array.from(trend.values());
};

const getTopProducts = async (where: OrderScope) => {
  const items = await prisma.orderItem.findMany({
    where: { order: where },
    include: { product: { include: { productImages: { take: 1, orderBy: { createdAt: 'asc' } } } } },
  });
  const groups = new Map<string, ProductGroup>();
  items.forEach((item) => {
    const existing = groups.get(item.productId) ?? {
      name: item.productName,
      imageUrl: item.product.productImages[0]?.url ?? null,
      quantity: 0,
      revenue: 0,
    };
    existing.quantity += item.quantity;
    existing.revenue += Number(item.subtotal);
    groups.set(item.productId, existing);
  });
  return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 4);
};

const getSalesByCategory = async (where: OrderScope) => {
  const items = await prisma.orderItem.findMany({
    where: { order: where },
    include: { product: { include: { category: true } } },
  });
  const groups = new Map<string, number>();
  items.forEach((item) => {
    const name = item.product.category.name;
    groups.set(name, (groups.get(name) ?? 0) + Number(item.subtotal));
  });
  const total = Array.from(groups.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(groups.entries()).map(([name, revenue]) => ({
    name,
    revenue,
    percentage: total ? Math.round((revenue / total) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue);
};

const startDate = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - 28);
  return date;
};

const seedTrend = (start: Date) => {
  const trend = new Map<string, TrendRow>();
  for (let i = 0; i < 30; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    trend.set(dateKey(date), { date: dateKey(date), revenue: 0, orders: 0 });
  }
  return trend;
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
