import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { v2 as cloudinary } from 'cloudinary';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@/application/database';
import { logger } from '@/application/logging';
import { ResponseError } from '@/error/response.error';

type TokenType = 'EMAIL_VERIFICATION' | 'RESET_PASSWORD' | 'EMAIL_CHANGE';
type RegisterInput = { email: string };
type LoginInput = { email: string; password: string };
type VerifyInput = { token: string; password: string };
type ProfileInput = { name?: string };
type EmailInput = { email: string };
type PasswordInput = { currentPassword: string; newPassword: string };

const TOKEN_TTL_MS = 60 * 60 * 1000;
const selectUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  authProvider: true,
  isVerified: true,
  emailVerifiedAt: true,
  profileImageUrl: true,
  storeAdmins: {
    select: {
      id: true,
      storeId: true,
      store: {
        select: {
          id: true,
          name: true,
          address: true,
          type: true,
        },
      },
    },
  },
} as const;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const makeRawToken = () => crypto.randomBytes(32).toString('hex');
const appUrl = () => process.env.APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3000';
const jwtSecret = () => process.env.JWT_SECRET ?? 'freshmart-dev-secret';

const publicUser = async (id: string) => prisma.user.findUnique({ where: { id }, select: selectUser });

const debugLink = (path: string, raw: string) => `${appUrl()}${path}${path.includes('?') ? '&' : '?'}token=${raw}`;

const saveToken = async (userId: string, type: TokenType, newEmail?: string) => {
  const raw = makeRawToken();
  await prisma.verificationToken.create({
    data: { userId, type, tokenHash: hashToken(raw), newEmail, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });
  return raw;
};

const sendEmail = async (to: string, subject: string, body: string) => {
  if (!process.env.SMTP_HOST) return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transporter.sendMail({ from: process.env.SMTP_FROM ?? 'FreshMart <no-reply@freshmart.test>', to, subject, text: body });
  return true;
};

const mailResult = async (email: string, subject: string, path: string, token: string) => {
  const link = debugLink(path, token);
  const sent = await sendEmail(email, subject, `${subject}\n\n${link}`);
  if (!sent) logger.info({ message: 'Email fallback link', email, link });
  return process.env.NODE_ENV === 'production' ? undefined : link;
};

const consumeToken = async (raw: string, type: TokenType) => {
  const token = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!token || token.type !== type || token.usedAt) throw new ResponseError(StatusCodes.BAD_REQUEST, 'Invalid token.');
  if (token.expiresAt < new Date()) throw new ResponseError(StatusCodes.BAD_REQUEST, 'Token has expired.');
  await prisma.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
  return token;
};

export const register = async (input: RegisterInput) => {
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { pendingEmail: email }] } });
  if (existing) throw new ResponseError(StatusCodes.CONFLICT, 'Email already registered.');
  const user = await prisma.user.create({ data: { email, name: email.split('@')[0] } });
  const token = await saveToken(user.id, 'EMAIL_VERIFICATION');
  const link = await mailResult(email, 'Verify your FreshMart account', '/verify-email', token);
  return { message: 'Registration successful. Please verify your email.', email, debugLink: link };
};

export const resendVerification = async (input: EmailInput) => {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ResponseError(StatusCodes.NOT_FOUND, 'User not found.');
  if (user.isVerified) throw new ResponseError(StatusCodes.BAD_REQUEST, 'Email already verified.');
  const token = await saveToken(user.id, 'EMAIL_VERIFICATION');
  const link = await mailResult(email, 'Verify your FreshMart account', '/verify-email', token);
  return { message: 'Verification email sent.', email, debugLink: link };
};

export const verifyEmail = async (input: VerifyInput) => {
  const token = await consumeToken(input.token, 'EMAIL_VERIFICATION');
  const password = await bcrypt.hash(input.password, 12);
  await prisma.user.update({
    where: { id: token.userId },
    data: { password, isVerified: true, emailVerifiedAt: new Date() },
  });
  return { message: 'Email verified. Please login again.' };
};

export const login = async (input: LoginInput) => {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) throw new ResponseError(StatusCodes.UNAUTHORIZED, 'Invalid email or password.');
  const ok = await bcrypt.compare(input.password, user.password);
  if (!ok) throw new ResponseError(StatusCodes.UNAUTHORIZED, 'Invalid email or password.');
  const accessToken = jwt.sign({ sub: user.id, role: user.role }, jwtSecret(), { expiresIn: '1d' });
  return { accessToken, user: await publicUser(user.id) };
};

export const forgotPassword = async (input: EmailInput) => {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.authProvider !== 'EMAIL' || !user.password) return { message: 'If eligible, reset email has been sent.' };
  const token = await saveToken(user.id, 'RESET_PASSWORD');
  const link = await mailResult(email, 'Reset your FreshMart password', '/reset-password', token);
  return { message: 'If eligible, reset email has been sent.', debugLink: link };
};

export const resetPassword = async (input: VerifyInput) => {
  const token = await consumeToken(input.token, 'RESET_PASSWORD');
  if (token.user.authProvider !== 'EMAIL') throw new ResponseError(StatusCodes.BAD_REQUEST, 'Social login users cannot reset password here.');
  const password = await bcrypt.hash(input.password, 12);
  await prisma.user.update({ where: { id: token.userId }, data: { password } });
  return { message: 'Password reset successful. Please login again.' };
};

export const verifyAccessToken = (token: string) => {
  const payload = jwt.verify(token, jwtSecret()) as JwtPayload;
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('Invalid token.');
  return { id: payload.sub, role: String(payload.role ?? 'CUSTOMER') };
};

export const getMe = async (userId: string) => publicUser(userId);

export const updateProfile = async (userId: string, input: ProfileInput) => {
  await prisma.user.update({ where: { id: userId }, data: { name: input.name } });
  return publicUser(userId);
};

export const uploadProfileImage = async (userId: string, file: Express.Multer.File) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new ResponseError(500, 'Cloudinary is not configured.');
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
  const image = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: 'freshmart/profiles' }, (error, result) => error || !result ? reject(error) : resolve(result));
    stream.end(file.buffer);
  });
  await prisma.user.update({ where: { id: userId }, data: { profileImageUrl: image.secure_url } });
  return publicUser(userId);
};

export const changePassword = async (userId: string, input: PasswordInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.password) throw new ResponseError(StatusCodes.BAD_REQUEST, 'Password is not available for this account.');
  const ok = await bcrypt.compare(input.currentPassword, user.password);
  if (!ok) throw new ResponseError(StatusCodes.UNAUTHORIZED, 'Current password is incorrect.');
  const password = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password } });
  return { message: 'Password updated.' };
};

export const requestEmailChange = async (userId: string, input: EmailInput) => {
  const email = normalizeEmail(input.email);
  const used = await prisma.user.findFirst({ where: { OR: [{ email }, { pendingEmail: email }] } });
  if (used) throw new ResponseError(StatusCodes.CONFLICT, 'Email already registered.');
  await prisma.user.update({ where: { id: userId }, data: { pendingEmail: email, isVerified: false } });
  const token = await saveToken(userId, 'EMAIL_CHANGE', email);
  const link = await mailResult(email, 'Verify your new FreshMart email', '/verify-email?mode=email-change', token);
  return { message: 'Verification email sent to new address.', debugLink: link };
};

export const verifyEmailChange = async (rawToken: string) => {
  const token = await consumeToken(rawToken, 'EMAIL_CHANGE');
  if (!token.newEmail) throw new ResponseError(StatusCodes.BAD_REQUEST, 'Invalid email change token.');
  await prisma.user.update({
    where: { id: token.userId },
    data: { email: token.newEmail, pendingEmail: null, isVerified: true, emailVerifiedAt: new Date() },
  });
  return { message: 'Email updated.' };
};