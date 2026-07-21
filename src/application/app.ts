import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';
import cookieParser from 'cookie-parser';
import {
  ALLOWED_ORIGINS,
  API_PREFIX,
  NODE_ENV,
} from '../configs/dotenv.config';
import { errorMiddleware } from '@/middlewares/error.middleware';
import addressRouter from '@/features/addresses/addresses.router';
import cartRouter from '@/features/carts/carts.routes';
import shippingRouter from '@/features/shippings/shippings.routes';
import orderRouter from '../features/orders/orders.routes';
import paymentRouter from '../features/payments/payments.routes';
import authRouter from '@/features/auth/auth.router';
import catalogRouter from '@/features/catalog/catalog.routes';
import adminProductRouter from '@/features/admin-products/admin-products.routes';
import adminInventoryRouter from '@/features/admin-inventories/admin-inventories.routes';
import adminStockMutationRouter from '@/features/admin-stock-mutations/admin-stock-mutations.routes';
import adminCategoryRouter from '@/features/admin-categories/admin-categories.routes';
import adminStoreRouter from '@/features/admin-stores/admin-stores.routes';
import adminUserRouter from '@/features/admin-users/admin-users.routes';
import adminDashboardRouter from '@/features/admin-dashboard/admin-dashboard.routes';

const app: Application = express();

/*
─────────────────────────────────────────────────────────────
Rate Limiter
─────────────────────────────────────────────────────────────
*/
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: StatusCodes.TOO_MANY_REQUESTS,
    message: 'Too many requests, please try again later.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: StatusCodes.TOO_MANY_REQUESTS,
    message: 'Too many login attempts, please try again later.',
  },
});

// app.use(globalLimiter);


/*
─────────────────────────────────────────────────────────────
Security Middleware
─────────────────────────────────────────────────────────────
*/
app.use(helmet());

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

/*
─────────────────────────────────────────────────────────────
Cookie Parser
─────────────────────────────────────────────────────────────
*/
app.use(cookieParser());

/*
─────────────────────────────────────────────────────────────
Standard Middleware
─────────────────────────────────────────────────────────────
*/
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

/*
─────────────────────────────────────────────────────────────
Health Check
─────────────────────────────────────────────────────────────
*/
app.get('/health', (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({
    status: 'healthy',
    environment: process.env.NODE_ENV ?? 'development',
    timestamp: new Date().toISOString(),
  });
});

/*
─────────────────────────────────────────────────────────────
API Routes
─────────────────────────────────────────────────────────────
*/
// Daftarkan Route Fitur Alamat kamu (Feature 2)
app.use(`${API_PREFIX}/auth`, authRouter); //authLimiter : dimatikan sementara untuk menghindari error 429 Too Many Requests
app.use(`${API_PREFIX}/addresses`, addressRouter);
app.use(`${API_PREFIX}/carts`, cartRouter);

// Daftarkan Route Fitur Keranjang kamu (Feature 3)
app.use(`${API_PREFIX}/carts`, cartRouter);

app.use(`${API_PREFIX}/shippings`, shippingRouter);

app.use(`${API_PREFIX}/orders`, orderRouter);

app.use(`${API_PREFIX}/payments`, paymentRouter);

app.use(`${API_PREFIX}/admin/products`, adminProductRouter);
app.use(`${API_PREFIX}/admin/inventories`, adminInventoryRouter);
app.use(`${API_PREFIX}/admin/stock-mutations`, adminStockMutationRouter);
app.use(`${API_PREFIX}/admin/categories`, adminCategoryRouter);
app.use(`${API_PREFIX}/admin/stores`, adminStoreRouter);
app.use(`${API_PREFIX}/admin/users`, adminUserRouter);
app.use(`${API_PREFIX}/admin/dashboard`, adminDashboardRouter);

app.use(API_PREFIX, catalogRouter);

// Placeholder route utama
app.get(API_PREFIX, (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({
    message: 'Online Grocery API is running 🛒',
    version: '1.0.0',
  });
});

/*
─────────────────────────────────────────────────────────────
404 Handler
─────────────────────────────────────────────────────────────
*/
app.use((_req: Request, res: Response) => {
  res.status(StatusCodes.NOT_FOUND).json({
    status: StatusCodes.NOT_FOUND,
    message: 'Route not found.',
  });
});

/*
─────────────────────────────────────────────────────────────
Global Error Handler
─────────────────────────────────────────────────────────────
*/
app.use(errorMiddleware);

export default app;
