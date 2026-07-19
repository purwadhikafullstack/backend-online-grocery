import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { Validation } from '@/validations/validation';
import * as catalogService from './catalog.service';
import { categoryQuerySchema, productDetailParamsSchema, locationQuerySchema, productQuerySchema } from './catalog.validation';

export const getDefaultStoreLocation = async (_req: Request, res: Response) => {
  const data = await catalogService.getDefaultStoreLocation();
  res.status(StatusCodes.OK).json({ data });
};

// 🚀 TAMBAHAN BARU: Controller publik untuk melayani endpoint GET /stores
export const getStores = async (_req: Request, res: Response) => {
  const data = await catalogService.getStores();
  res.status(StatusCodes.OK).json({ data });
};

export const getCategories = async (req: Request, res: Response) => {
  const query = Validation.validate(categoryQuerySchema, req.query);
  const result = await catalogService.getCategories(query);
  res.status(StatusCodes.OK).json(result);
};

export const getProducts = async (req: Request, res: Response) => {
  const query = Validation.validate(productQuerySchema, req.query);
  const result = await catalogService.getProducts(query);
  res.status(StatusCodes.OK).json(result);
};

export const getProductBySlug = async (req: Request, res: Response) => {
  const { slug } = Validation.validate(productDetailParamsSchema, req.params);
  const query = Validation.validate(locationQuerySchema, req.query);
  const result = await catalogService.getProductBySlug(slug, query);
  res.status(StatusCodes.OK).json(result);
};