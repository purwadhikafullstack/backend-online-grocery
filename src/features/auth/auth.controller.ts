import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import * as authService from './auth.service';
import * as githubAuthService from './github-auth.service';
import * as googleAuthProvider from './google-auth-provider';
import { ResponseError } from '@/error/response.error';

const emailSchema = z.object({ email: z.string().email().max(120) });
const loginSchema = emailSchema.extend({ password: z.string().min(8).max(72) });
const verifySchema = z.object({ token: z.string().min(32), password: z.string().min(8).max(72) });
const profileSchema = z.object({ name: z.string().min(2).max(80).optional() });
const passwordSchema = z.object({ currentPassword: z.string().min(8), newPassword: z.string().min(8).max(72) });
const tokenSchema = z.object({ token: z.string().min(32) });
const githubCallbackSchema = z.object({ code: z.string().min(8) });
const googleCredentialSchema = z.object({ credential: z.string().trim().min(1).max(10000) });

const userId = (req: Request) => {
  if (!req.user) throw new ResponseError(StatusCodes.UNAUTHORIZED, 'Authentication required.');
  return req.user.id;
};

const run = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export const register = run(async (req, res) => {
  const result = await authService.register(emailSchema.parse(req.body));
  res.status(StatusCodes.CREATED).json(result);
});

export const resendVerification = run(async (req, res) => {
  const result = await authService.resendVerification(emailSchema.parse(req.body));
  res.status(StatusCodes.OK).json(result);
});

export const verifyEmail = run(async (req, res) => {
  const result = await authService.verifyEmail(verifySchema.parse(req.body));
  res.status(StatusCodes.OK).json(result);
});

export const login = run(async (req, res) => {
  const result = await authService.login(loginSchema.parse(req.body));
  res.status(StatusCodes.OK).json(result);
});

export const githubCallback = run(async (req, res) => {
  const result = await githubAuthService.loginWithGitHub(githubCallbackSchema.parse(req.body).code);
  res.status(StatusCodes.OK).json(result);
});

export const google = run(async (req, res) => {
  const result = await googleAuthProvider.loginWithGoogle(
    googleCredentialSchema.parse(req.body).credential,
  );
  res.status(StatusCodes.OK).json(result);
});

export const forgotPassword = run(async (req, res) => {
  const result = await authService.forgotPassword(emailSchema.parse(req.body));
  res.status(StatusCodes.OK).json(result);
});

export const resetPassword = run(async (req, res) => {
  const result = await authService.resetPassword(verifySchema.parse(req.body));
  res.status(StatusCodes.OK).json(result);
});

export const getMe = run(async (req, res) => {
  const result = await authService.getMe(userId(req));
  res.status(StatusCodes.OK).json({ data: result });
});

export const updateProfile = run(async (req, res) => {
  const result = await authService.updateProfile(userId(req), profileSchema.parse(req.body));
  res.status(StatusCodes.OK).json({ data: result });
});

export const uploadProfileImage = run(async (req, res) => {
  if (!req.file) throw new ResponseError(StatusCodes.BAD_REQUEST, 'Profile image is required.');
  const result = await authService.uploadProfileImage(userId(req), req.file);
  res.status(StatusCodes.OK).json({ data: result });
});

export const changePassword = run(async (req, res) => {
  const result = await authService.changePassword(userId(req), passwordSchema.parse(req.body));
  res.status(StatusCodes.OK).json(result);
});

export const requestEmailChange = run(async (req, res) => {
  const result = await authService.requestEmailChange(userId(req), emailSchema.parse(req.body));
  res.status(StatusCodes.OK).json(result);
});

export const verifyEmailChange = run(async (req, res) => {
  const body = tokenSchema.parse(req.body);
  const result = await authService.verifyEmailChange(body.token);
  res.status(StatusCodes.OK).json(result);
});

export const logout = run(async (_req, res) => {
  res.status(StatusCodes.OK).json({ message: 'Logged out.' });
});
