import { Prisma, StoreType } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@/application/database';
import { ResponseError } from '@/error/response.error';
import { findNearestStore } from '@/utils/haversine';

const FALLBACK_STORE = {
  id: 'main-store-fallback',
  name: 'Toko Utama',
  address: 'Tangerang',
  latitude: -6.222,
  longitude: 106.649,
};

type CatalogQuery = {
  latitude?: number;
  longitude?: number;
};

type ProductQuery = CatalogQuery & {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  sortBy: 'name' | 'price' | 'createdAt';
  sortOrder: 'asc' | 'desc';
};

type CategoryWithCount = Prisma.CategoryGetPayload<{
  include: { _count: { select: { products: true } } };
}>;

export const getDefaultStoreLocation = async () => {
  const storeUtama = await prisma.store.findFirst({
    where: { type: StoreType.UTAMA, deletedAt: null },
  });
  return storeUtama ?? FALLBACK_STORE;
};

// 🚀 TAMBAHAN BARU: Fungsi service publik untuk menarik seluruh daftar toko cabang aktif
export const getStores = async () => {
  return await getStoreBranches();
};

const getStoreBranches = async () => {
  const stores = await prisma.store.findMany({ where: { deletedAt: null } });
  return stores.map((store) => ({ ...store, latitude: Number(store.latitude), longitude: Number(store.longitude) }));
};

export const resolveNearestStore = async (query: CatalogQuery) => {
  const stores = await getStoreBranches();
  if (!stores.length) return FALLBACK_STORE;
  const fallback = await getDefaultStoreLocation();
  const userCoords = {
    latitude: query.latitude ?? Number(fallback.latitude),
    longitude: query.longitude ?? Number(fallback.longitude),
  };
  return findNearestStore(userCoords, stores) ?? fallback;
};

export const getCategories = async (query: CatalogQuery & { limit: number }) => {
  const store = await resolveNearestStore(query);
  if (store.id === FALLBACK_STORE.id) return { data: [], nearestStore: store };
  const categories = await prisma.category.findMany({
    where: { products: { some: { isActive: true, deletedAt: null, inventories: { some: { storeId: store.id } } } } },
    take: query.limit,
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: { where: { inventories: { some: { storeId: store.id } } } } } } },
  });
  return { data: categories.map(mapCategory), nearestStore: store };
};

const mapCategory = (category: CategoryWithCount) => ({
  id: category.id,
  name: category.name,
  imageUrl: category.imageUrl,
  productCount: category._count.products,
});

const buildProductWhere = (storeId: string, query: ProductQuery): Prisma.InventoryWhereInput => ({
  storeId,
  product: {
    isActive: true,
    deletedAt: null,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  },
});

const productOrderBy = (query: ProductQuery): Prisma.InventoryOrderByWithRelationInput => {
  if (query.sortBy === 'price') return { product: { price: query.sortOrder } };
  if (query.sortBy === 'name') return { product: { name: query.sortOrder } };
  return { product: { createdAt: query.sortOrder } };
};

export const getProducts = async (query: ProductQuery) => {
  const nearestStore = await resolveNearestStore(query);
  if (nearestStore.id === FALLBACK_STORE.id) return emptyProducts(query, nearestStore);
  const where = buildProductWhere(nearestStore.id, query);
  const [items, total] = await prisma.$transaction([
    prisma.inventory.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: productOrderBy(query), include: productInclude }),
    prisma.inventory.count({ where }),
  ]);
  return { data: items.map(mapProduct), meta: productMeta(query, total, nearestStore) };
};

const productInclude = { store: true, product: { include: { category: true, productImages: { take: 1 } } } };
const productDetailInclude = { category: true, productImages: { orderBy: { createdAt: 'asc' as const } } };

const mapProduct = (item: Prisma.InventoryGetPayload<{ include: typeof productInclude }>) => ({
  id: item.product.id,
  slug: item.product.slug,
  name: item.product.name,
  description: item.product.description,
  price: item.product.price.toString(),
  imageUrl: item.product.productImages[0]?.url ?? null,
  category: { id: item.product.category.id, name: item.product.category.name },
  storeId: item.storeId,
  storeName: item.store.name,
  stock: item.stock,
});

const productMeta = (query: ProductQuery, total: number, nearestStore: unknown) => ({
  page: query.page,
  limit: query.limit,
  total,
  totalPages: Math.ceil(total / query.limit),
  search: query.search ?? '',
  sortBy: query.sortBy,
  sortOrder: query.sortOrder,
  nearestStore,
});

const emptyProducts = (query: ProductQuery, nearestStore: unknown) => ({
  data: [],
  meta: productMeta(query, 0, nearestStore),
});

export const getProductBySlug = async (slug: string, query: CatalogQuery) => {
  const product = await prisma.product.findFirst({
    where: { slug, isActive: true, deletedAt: null },
    include: productDetailInclude,
  });
  if (!product) throw new ResponseError(StatusCodes.NOT_FOUND, 'Product not found.');

  const nearestStore = await resolveNearestStore(query);
  const inventory = nearestStore.id === FALLBACK_STORE.id ? null : await prisma.inventory.findUnique({
    where: { storeId_productId: { storeId: nearestStore.id, productId: product.id } },
    include: { store: true },
  });
  const relatedProducts = nearestStore.id === FALLBACK_STORE.id ? [] : await getRelatedProducts(product.id, product.categoryId, nearestStore.id);
  return {
    data: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      price: product.price.toString(),
      images: product.productImages.map((image) => ({ id: image.id, url: image.url })),
      category: { id: product.category.id, name: product.category.name },
      storeId: inventory?.storeId ?? nearestStore.id,
      storeName: inventory?.store.name ?? nearestStore.name,
      stock: inventory?.stock ?? 0,
      relatedProducts: relatedProducts.map(mapProduct),
    },
  };
};

const getRelatedProducts = (productId: string, categoryId: string, storeId: string) => {
  return prisma.inventory.findMany({
    where: { storeId, productId: { not: productId }, product: { categoryId, isActive: true, deletedAt: null } },
    take: 8,
    orderBy: { product: { createdAt: 'desc' } },
    include: productInclude,
  });
};