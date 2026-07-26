import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { StatusCodes } from 'http-status-codes';
import * as authController from './auth.controller';
import { authenticateUser } from '@/middlewares/auth.middleware';
import { ResponseError } from '@/error/response.error';

const router = Router();
const allowedExt = ['.jpg', '.jpeg', '.png', '.gif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.includes(ext)) {
      cb(new ResponseError(StatusCodes.BAD_REQUEST, 'Only jpg, jpeg, png, and gif files are allowed.'));
      return;
    }
    cb(null, true);
  },
});

router.post('/register', authController.register);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);
router.post('/login', authController.login);
router.post('/google', authController.google);
router.post('/github/callback', authController.githubCallback);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/verify-email-change', authController.verifyEmailChange);
router.post('/logout', authController.logout);

router.get('/me', authenticateUser, authController.getMe);
router.patch('/profile', authenticateUser, authController.updateProfile);
router.patch('/profile/image', authenticateUser, upload.single('avatar'), authController.uploadProfileImage);
router.patch('/password', authenticateUser, authController.changePassword);
router.post('/request-email-change', authenticateUser, authController.requestEmailChange);

export default router;
