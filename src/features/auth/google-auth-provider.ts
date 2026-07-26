import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@/application/database';
import { ResponseError } from '@/error/response.error';

type GoogleProfile = {
  providerUserId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
};

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

const jwtSecret = () => process.env.JWT_SECRET ?? 'freshmart-dev-secret';

const googleClientId = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new ResponseError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'GOOGLE_CLIENT_ID is not configured.',
    );
  }
  return clientId;
};

const verifyGoogleCredential = async (credential: string): Promise<GoogleProfile> => {
  const clientId = googleClientId();

  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new ResponseError(
        StatusCodes.UNAUTHORIZED,
        'Google account must have a verified email.',
      );
    }

    return {
      providerUserId: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: payload.name,
      avatarUrl: payload.picture,
    };
  } catch (error) {
    if (error instanceof ResponseError) throw error;
    throw new ResponseError(StatusCodes.UNAUTHORIZED, 'Invalid Google credential.');
  }
};

const signInResponse = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: selectUser,
  });
  const accessToken = jwt.sign(
    { sub: user.id, role: user.role },
    jwtSecret(),
    { expiresIn: '1d' },
  );
  return { accessToken, user };
};

const updateLinkedAccount = async (userId: string, profile: GoogleProfile) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  await prisma.$transaction([
    prisma.socialAccount.update({
      where: {
        provider_providerUserId: {
          provider: 'GOOGLE',
          providerUserId: profile.providerUserId,
        },
      },
      data: { email: profile.email, avatarUrl: profile.avatarUrl },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        isVerified: true,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        profileImageUrl: user.profileImageUrl ?? profile.avatarUrl,
      },
    }),
  ]);
};

const linkGoogleAccount = async (userId: string, profile: GoogleProfile) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  await prisma.$transaction([
    prisma.socialAccount.upsert({
      where: { userId_provider: { userId, provider: 'GOOGLE' } },
      update: {
        providerUserId: profile.providerUserId,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      },
      create: {
        userId,
        provider: 'GOOGLE',
        providerUserId: profile.providerUserId,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        isVerified: true,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        profileImageUrl: user.profileImageUrl ?? profile.avatarUrl,
      },
    }),
  ]);
};

const createGoogleUser = async (profile: GoogleProfile) => prisma.user.create({
  data: {
    email: profile.email,
    name: profile.name ?? profile.email.split('@')[0],
    authProvider: 'GOOGLE',
    isVerified: true,
    emailVerifiedAt: new Date(),
    profileImageUrl: profile.avatarUrl,
    socialAccounts: {
      create: {
        provider: 'GOOGLE',
        providerUserId: profile.providerUserId,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      },
    },
  },
});

const ensureLinkedUser = async (profile: GoogleProfile) => {
  const account = await prisma.socialAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: 'GOOGLE',
        providerUserId: profile.providerUserId,
      },
    },
  });

  if (account) {
    await updateLinkedAccount(account.userId, profile);
    return account.userId;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: profile.email },
  });
  if (existingUser) {
    await linkGoogleAccount(existingUser.id, profile);
    return existingUser.id;
  }

  const user = await createGoogleUser(profile);
  return user.id;
};

export const loginWithGoogle = async (credential: string) => {
  const profile = await verifyGoogleCredential(credential);
  const userId = await ensureLinkedUser(profile);
  return signInResponse(userId);
};
