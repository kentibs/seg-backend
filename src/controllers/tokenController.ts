import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/error";
import { asyncHandler } from "../utils/asyncHandler";
import { PrismaClient } from "@prisma/client";
import { RandomNumber } from "../utils/random";
import { Role } from "../types/role";
import { Email } from "../utils/email";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const SignupToken = prisma.signupToken;

export const updateSignupTokenAsUsed = async (tokenId: string) => {
  const currentDateISOString = new Date(Date.now()).toISOString();

  await SignupToken.update({
    where: { tokenId: tokenId },
    data: {
      used: true,
      usedAt: currentDateISOString,
      expiresAt: currentDateISOString,
    },
  });
};

const validateRole = (role: string): boolean => {
  const isAdmin = role === Role.ADMIN;
  const isSuperAdmin = role === Role.SUPERADMIN;

  if (isAdmin || isSuperAdmin) {
    return true;
  }
  return false;
};

export const generateSendTokensOnAppStart = async () => {
  const tokens = await SignupToken.findMany({});
  if (tokens[0]) return;

  const INIT_ADMIN_EMAIL_LIST = process.env.INIT_ADMIN_EMAIL_LIST!;
  const emailList: string[] = JSON.parse(INIT_ADMIN_EMAIL_LIST);

  const buildEmailList = (): string[] => {
    const mailList: string[] = [];

    emailList.map((mail: string) => {
      if (mail) mailList.push(mail);
    });
    return mailList;
  };

  console.log("buildEmailList", buildEmailList());
  const systemUser = await prisma.user.create({
    data: {
      firstName: "system",
      lastName: "system",
      gender: "male",
      email: "system",
      phoneNumber: "0000000000",
      role: "superadmin",
      password: await hash("password", 10),
    },
    select: { userId: true },
  });

  buildEmailList().map(async (email, index) => {
    const token = new RandomNumber().d8();
    const tokenExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString(); //24 hours

    await SignupToken.create({
      data: {
        token: token,
        associatedEmail: email,
        associatedRole: Role.SUPERADMIN,
        generatedByUserId: systemUser.userId,
        expiresAt: tokenExpiresAt,
      },
    });
    await new Email(email, "Initial Signup Token").sendInitSignUpToken(token);
    console.log(`Token mail ${index + 1} sent -->`, token);
  });
};

export const generateSignupToken = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = res.locals.user.userId as string;
    const associatedEmail = req.body.associatedEmail as string;
    const associatedRole = req.body.associatedRole as Role;

    if (!userId) {
      return next(new AppError("Please provide userId", 400));
    }
    if (!associatedRole) {
      return next(
        new AppError("Please provide role to associated with token", 400)
      );
    }
    if (!validateRole(associatedRole)) {
      return next(new AppError("Please provide a valid role", 400));
    }
    if (!associatedEmail.includes("@")) {
      return next(new AppError("Please provide a valid email", 400));
    }

    const token = new RandomNumber().d8();
    const tokenExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString(); //24 hours

    const newToken = await SignupToken.create({
      data: {
        token: token,
        associatedEmail: associatedEmail,
        associatedRole: associatedRole,
        generatedByUserId: userId,
        expiresAt: tokenExpiresAt,
      },
      select: {
        tokenId: true,
        token: true,
        generatedByUserId: true,
        used: true,
        usedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({
      status: "success",
      message: "Signup Token created successfully",
      data: { token: newToken },
    });
  }
);

export const getSignupTokensByGeneratedByUserId = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const generatedByUserId = req.query.generatedByUserId as string;
    if (!generatedByUserId) {
      return next(new AppError("Please provide userId", 400));
    }
    const tokens = await SignupToken.findMany({
      where: { generatedByUserId: { equals: generatedByUserId } },
      include: {
        User: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            gender: true,
            role: true,
            imageUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!tokens[0]) {
      return next(new AppError("No tokens found for this user", 404));
    }

    res.status(200).json({
      status: "success",
      message: "Signup Tokens fetched successfully",
      data: { tokens: tokens },
    });
  }
);

export const getAllSignupTokens = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const tokens = await SignupToken.findMany({
      include: {
        User: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            gender: true,
            role: true,
            imageUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!tokens[0]) {
      return next(new AppError("No tokens found", 404));
    }

    res.status(200).json({
      status: "success",
      message: "Signup Tokens fetched successfully",
      data: { tokens: tokens },
    });
  }
);

export const editSignupToken = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const tokenId = req.params.tokenId;
    const userId = res.locals.user.userId as string;
    if (!tokenId) {
      return next(new AppError("Please provide tokenId", 400));
    }
    const token = await SignupToken.findFirst({
      where: { tokenId: { equals: tokenId } },
    });
    if (!token) {
      return next(new AppError("Token not found", 404));
    }
    if (userId !== token?.generatedByUserId) {
      return next(
        new AppError("Not authorized to perform this operation", 401)
      );
    }
    if (token.used) {
      return next(new AppError("Can't edit already used token", 400));
    }

    const generatedToken = new RandomNumber().d8();

    const updatedToken = await SignupToken.update({
      where: { tokenId: tokenId },
      data: { token: generatedToken },
      select: {
        tokenId: true,
        token: true,
        generatedByUserId: true,
        used: true,
        usedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      status: "success",
      message: "Signup Token edited successfully",
      data: { token: updatedToken },
    });
  }
);

export const deleteSignupToken = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const tokenId = req.params.tokenId;
    const userId = res.locals.user.userId as string;
    if (!tokenId) {
      return next(new AppError("Please provide userId", 400));
    }
    const token = await SignupToken.findFirst({
      where: { tokenId: { equals: tokenId } },
    });
    if (!token) {
      return next(new AppError("Token not found", 404));
    }
    if (userId !== token?.generatedByUserId) {
      return next(
        new AppError("Not authorized to perform this operation", 401)
      );
    }
    if (token.used) {
      return next(new AppError("Can't delete already used token", 400));
    }

    await SignupToken.delete({ where: { tokenId: tokenId } });

    res.status(200).json({
      status: "success",
      message: "Signup Token deleted successfully",
    });
  }
);

export const validateSignupToken = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const token = parseInt(req.body.signupToken);

    if (!token) {
      return next(new AppError("Please provide signup token!", 400));
    }
    const dbToken = await SignupToken.findFirst({
      where: { token: { equals: token } },
    });

    if (!dbToken) {
      return next(new AppError("Couldn't find token match!", 403));
    }
    const email = req.body.email;
    if (email !== dbToken.associatedEmail) {
      return next(
        new AppError(
          "Provided email does not match token associated email!",
          403
        )
      );
    }

    const tokenExpiry = dbToken.expiresAt as Date;
    const tokenIsExpired = new Date(Date.now()) > new Date(tokenExpiry);

    if (dbToken.used || tokenIsExpired) {
      return next(
        new AppError("Signup token is already used or expired!", 403)
      );
    }

    delete req.body["signupToken"];
    res.locals.dbToken = dbToken;
    next();
  }
);
