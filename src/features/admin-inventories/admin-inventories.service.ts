import { MutationType, Prisma } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@/application/database';
import { ResponseError } from '@/error/response.error';
import { assertAdminUser, resolveReadableStores, resolveWritableStore } from '@/features/admin/admin-access';
import type { InventoryBodyInput, InventoryListInput, StockUpdateInput } from './admin-inventories.validation';

type UserPayload = { id: string; role: string };

const includeInventory = { product: { include: { category: true, productImages: { take: 1 } } }, store: true };

export const listInventories = async (rawUser: UserPayload | undefined, query: InventoryListInput) => {
  const user = assertAdminUser(rawUser);
  const storeIds = await resolveReadableStores(user, query.storeId);
  const where = inventoryWhere(query, storeIds);
  const statsWhere = inventoryStatsWhere(query, storeIds);
  const [items, total, lowStock, outOfStock] = await prisma.$transaction([
    prisma.inventory.findMany({ where, include: includeInventory, skip: skip(query), take: query.limit, orderBy: orderBy(query) }),
    prisma.inventory.count({ where }),
    prisma.inventory.count({ where: { ...statsWhere, stock: { gt: 0, lte: 20 } } }),
    prisma.inventory.count({ where: { ...statsWhere, stock: 0 } }),
  ]);
  return { data: items.map(mapInventory), meta: meta(query, total), stats: { lowStock, outOfStock } };
};

export const createInventory = async (rawUser: UserPayload | undefined, input: InventoryBodyInput) => {
  const user = assertAdminUser(rawUser);
  const storeId = await resolveWritableStore(user, input.storeId);
  await ensureInventoryUnique(storeId, input.productId);
  return prisma.$transaction((tx) => createInventoryTx(tx, { ...input, storeId }));
};

export const updateStock = async (rawUser: UserPayload | undefined, id: string, input: StockUpdateInput) => {
  const user = assertAdminUser(rawUser);
  await resolveWritableInventory(user, id);
  return prisma.$transaction(async (tx) => applyStockMutation(tx, id, input));
};

export const deleteInventory = async (id: string) => {
  await ensureInventory(id);
  await prisma.$transaction([
    prisma.stockMutation.deleteMany({ where: { inventoryId: id } }),
    prisma.inventory.delete({ where: { id } }),
  ]);
  return { message: 'Inventory deleted.' };
};

export const listMutations = async (rawUser: UserPayload | undefined, id: string) => {
  const user = assertAdminUser(rawUser);
  await resolveReadableInventory(user, id);
  const data = await prisma.stockMutation.findMany({ where: { inventoryId: id }, orderBy: { createdAt: 'desc' } });
  return data.map(mapMutation);
};

const inventoryWhere = (query: InventoryListInput, storeIds?: string[]): Prisma.InventoryWhereInput => ({
  ...(storeIds ? { storeId: { in: storeIds.length ? storeIds : ['__no_access__'] } } : {}),
  ...productFilter(query),
  ...stockStatusWhere(query.stockStatus),
});

const inventoryStatsWhere = (query: InventoryListInput, storeIds?: string[]): Prisma.InventoryWhereInput => ({
  ...(storeIds ? { storeId: { in: storeIds.length ? storeIds : ['__no_access__'] } } : {}),
  ...productFilter(query),
});

const productFilter = (query: InventoryListInput): Prisma.InventoryWhereInput => ({
  ...(query.categoryId || query.search ? { product: productWhere(query) } : {}),
});

const productWhere = (query: InventoryListInput): Prisma.ProductWhereInput => ({
  ...(query.categoryId ? { categoryId: query.categoryId } : {}),
  ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
});

const stockStatusWhere = (status: string): Prisma.InventoryWhereInput => {
  if (status === 'in') return { stock: { gt: 20 } };
  if (status === 'low') return { stock: { gt: 0, lte: 20 } };
  if (status === 'out') return { stock: 0 };
  return {};
};

const orderBy = (query: InventoryListInput): Prisma.InventoryOrderByWithRelationInput => {
  if (query.sortBy === 'product') return { product: { name: query.sortOrder } };
  if (query.sortBy === 'store') return { store: { name: query.sortOrder } };
  if (query.sortBy === 'stock') return { stock: query.sortOrder };
  return { updatedAt: query.sortOrder };
};

const createInventoryTx = async (tx: Prisma.TransactionClient, input: InventoryBodyInput) => {
  const inventory = await tx.inventory.create({ data: { ...input, stock: 0 }, include: includeInventory });
  if (!input.stock) return mapInventory(inventory);
  return applyStockMutation(tx, inventory.id, { type: 'IN', quantity: input.stock, notes: 'Initial stock' });
};

const applyStockMutation = async (tx: Prisma.TransactionClient, id: string, input: StockUpdateInput) => {
  const inventory = await tx.inventory.findUnique({ where: { id } });
  if (!inventory) throw new ResponseError(StatusCodes.NOT_FOUND, 'Inventory not found.');
  const nextStock = nextStockValue(inventory.stock, input);
  await tx.stockMutation.create({ data: mutationData(id, input) });
  return tx.inventory.update({ where: { id }, data: { stock: nextStock }, include: includeInventory }).then(mapInventory);
};

const nextStockValue = (current: number, input: StockUpdateInput) => {
  const next = input.type === 'IN' ? current + input.quantity : current - input.quantity;
  if (next < 0) throw new ResponseError(StatusCodes.BAD_REQUEST, 'Stock cannot be negative.');
  return next;
};

const mutationData = (inventoryId: string, input: StockUpdateInput): Prisma.StockMutationCreateInput => ({
  inventory: { connect: { id: inventoryId } },
  type: input.type as MutationType,
  quantity: input.quantity,
  notes: input.notes || null,
});

const ensureInventoryUnique = async (storeId: string, productId: string) => {
  const inventory = await prisma.inventory.findUnique({ where: { storeId_productId: { storeId, productId } } });
  if (inventory) throw new ResponseError(StatusCodes.CONFLICT, 'Inventory already exists for this store.');
};

const ensureInventory = async (id: string) => {
  const inventory = await prisma.inventory.findUnique({ where: { id } });
  if (!inventory) throw new ResponseError(StatusCodes.NOT_FOUND, 'Inventory not found.');
  return inventory;
};

const resolveWritableInventory = async (user: UserPayload, id: string) => {
  const inventory = await ensureInventory(id);
  await resolveWritableStore(user, inventory.storeId);
  return inventory;
};

const resolveReadableInventory = async (user: UserPayload, id: string) => {
  const inventory = await ensureInventory(id);
  const storeIds = await resolveReadableStores(user, inventory.storeId);
  if (storeIds?.length === 0) throw new ResponseError(StatusCodes.FORBIDDEN, 'Store is outside your access.');
  return inventory;
};

type InventoryRecord = Prisma.InventoryGetPayload<{ include: typeof includeInventory }>;

const mapInventory = (item: InventoryRecord) => ({
  id: item.id,
  productId: item.productId,
  productName: item.product.name,
  categoryName: item.product.category.name,
  imageUrl: item.product.productImages[0]?.url ?? null,
  storeId: item.storeId,
  storeName: item.store.name,
  stock: item.stock,
  updatedAt: item.updatedAt,
});

const mapMutation = (item: { id: string; type: MutationType; quantity: number; notes: string | null; createdAt: Date }) => ({
  id: item.id,
  type: item.type,
  quantity: item.quantity,
  notes: item.notes,
  createdAt: item.createdAt,
});

const skip = (query: InventoryListInput) => (query.page - 1) * query.limit;

const meta = (query: InventoryListInput, total: number) => ({
  page: query.page,
  limit: query.limit,
  total,
  totalPages: Math.ceil(total / query.limit),
});
