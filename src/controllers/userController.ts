import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/error";
import { asyncHandler } from "../utils/asyncHandler";
import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { hash, compare, genSalt } from "bcryptjs";
import { RandomNumber } from "../utils/random";
import { Upload } from "../utils/upload";
import mime from "mime-types";

const prisma = new PrismaClient();
const User = prisma.user;
const AccessToken = prisma.accessToken;
const SignupToken = prisma.signupToken;

const signAccessToken = (userId: number) => {
  const jwtSecret = process.env.JWT_SECRET!;
  return jwt.sign({ userId: userId }, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN_HOURS,
  });
};

const saveAccessToken = async (userId: string, accessToken: string) => {
  await AccessToken.create({
    data: {
      userId: userId,
      token: accessToken,
    },
  });
};

const authenticate = async (
  user: any,
  statusCode: number,
  res: Response
): Promise<void> => {
  const accessToken = signAccessToken(user.userId);
  const JWT_EXPIRES_IN: number = parseInt(process.env.JWT_EXPIRES_IN_HOURS!);
  const expirationTime = new Date(Date.now() + JWT_EXPIRES_IN * 60 * 60 * 1000);
  const expiresIn = JWT_EXPIRES_IN * 60 * 60 * 1000;

  user.imagePath = undefined;
  user.password = undefined;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await saveAccessToken(user.userId, accessToken);

  res.status(statusCode).json({
    status: "success",
    accessToken: accessToken,
    expiresIn: expiresIn,
    expirationTime: expirationTime,
    user: user,
  });
};

export const signUp = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const firstName = req.body.firstName as string;
    const lastName = req.body.lastName as string;
    const phoneNumber = req.body.phoneNumber as string;
    const email = req.body.email as string;
    const password = req.body.password as string;

    if (!email || !phoneNumber || !firstName || !lastName || !password) {
      return next(new AppError("Please fill out all fields", 400));
    }
    const user = await User.findFirst({
      where: { email: { equals: email } },
    });
    if (user) return next(new AppError("phone number already taken", 400));

    const salt = await genSalt(10);
    req.body.password = await hash(req.body.password, salt);
    req.body.role = "seller";

    const newUser = await User.create({
      data: req.body,
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        // phoneNumber: true,
        imageUrl: true,
      },
    });

    authenticate(newUser, 201, res);
  }
);

export const signIn = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const email = req.body.email as string;
    const password = req.body.password as string;

    if (!email || !password) {
      return next(new AppError("Please fill out all fields", 400));
    }
    const user = await User.findFirst({
      where: { email: { equals: email } },
    });

    if (!user || !(await compare(password, user.password))) {
      return next(new AppError("Wrong number or password", 400));
    }
    authenticate(user, 200, res);
  }
);

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const email = req.body.email as string;

    if (!email) {
      return next(new AppError("Please fill out all fields", 400));
    }
    const user = await User.findFirst({
      where: { email: { equals: email } },
    });

    if (!user) {
      return next(
        new AppError("There is no user with supplied phone number", 404)
      );
    }

    // To revise the resetToken
    const resetToken = new RandomNumber().d6().toString();
    console.log(resetToken);
    const hashedToken = createHash("sha256").update(resetToken).digest("hex");

    await User.update({
      where: { userId: user.userId },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: new Date(
          Date.now() + 1000 * 60 * 20
        ).toISOString(),
      },
    });

    // const phoneNumberString = `${user.phoneNumber}`;
    // await new SMS(phoneNumberString).sendPasswordReset(resetToken);

    // Send email here

    res.status(200).json({
      status: "success",
      message: `Password reset token sent to ${email}`,
    });
  }
);

// Todo: to revise the reset password logic
export const resetPassword = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.body.userId as string;
    const newPassword = req.body.password as string;

    if (!userId) return next(new AppError("We can't identify this user", 403));

    if (!newPassword) {
      return next(new AppError("Please provide your new password", 400));
    }

    const user = await User.findFirst({
      where: {
        userId: { equals: userId },
      },
    });
    if (!user) {
      return next(new AppError("We couldn't user", 404));
    }
    const salt = await genSalt(10);
    user.password = await hash(req.body.password, salt);
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;

    await User.update({
      where: {
        userId: user.userId,
      },
      data: user,
    });

    authenticate(user, 200, res);
  }
);

export const protect = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];
    let token;
    if (authHeader && authHeader.startsWith("Bearer")) {
      token = authHeader.split(" ")[1];
    }
    if (!token) {
      return next(
        new AppError("You are not logged in! Please log in to get access", 400)
      );
    }
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    const userId = decoded.userId;

    const user = await User.findFirst({
      where: {
        userId: { equals: userId },
      },
    });

    if (!user) {
      return next(
        new AppError("The user belonging to this token does not exist!", 403)
      );
    }
    res.locals.user = user;
    next();
  }
);

export const editUserDetails = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.userId as string;
    const firstName = req.body.firstName as string;
    const lastName = req.body.lastName as string;

    if (!firstName) return next(new AppError("Please provide first name", 400));
    if (!lastName) return next(new AppError("Please provide last name", 400));

    const user = await User.findFirst({
      where: {
        userId: { equals: userId },
      },
    });
    if (!user) {
      return next(new AppError("we couldn't find user with userId", 404));
    }
    user.firstName = req.body.firstName;
    user.lastName = req.body.lastName;
    user.gender = req.body.gender;

    await User.update({
      where: {
        userId: user.userId,
      },
      data: user,
    });

    res.status(200).json({
      status: "success",
      message: "User details edited successfully",
    });
  }
);

export const updateUserImage = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const file = req.file;
    const userId = req.params.userId;
    if (!userId) return next(new AppError("No room id is provided", 400));
    if (file == undefined) {
      return next(new AppError("Please provide a room image", 400));
    }

    const mimeType = mime.lookup(file.originalname);
    const isImage = mimeType && mimeType.startsWith("image");
    if (!isImage) {
      return next(new AppError("Please provide file of image type", 400));
    }
    const user = await User.findFirst({
      where: {
        userId: { equals: userId },
      },
    });
    if (!user) {
      return next(
        new AppError(`We couldn't find user with provided userId`, 404)
      );
    }
    const imagePath = `users/${Date.now()}_${file.originalname}`;
    const upload = await new Upload(imagePath, next).add(file);
    const url = upload?.url;

    if (url) user.imageUrl = url;
    user.imagePath = imagePath;

    await User.update({
      where: {
        userId: userId,
      },
      data: user,
    });

    res.status(200).json({
      status: "success",
      message: `Image uploaded successfully`,
    });
  }
);

export const changePassword = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.userId;
    const currentPassword = req.body.currentPassword as string;
    const newPassword = req.body.newPassword as string;

    const user = await User.findFirst({
      where: {
        userId: { equals: userId },
      },
    });
    if (!user) {
      return next(new AppError("we couldn't find user with userId", 404));
    }

    if (!(await compare(currentPassword, user.password))) {
      return next(new AppError("wrong current password", 403));
    }

    if (await compare(newPassword, user.password)) {
      return next(new AppError("New password same as current password", 403));
    }
    const salt = await genSalt(10);
    user.password = await hash(newPassword, salt);

    await User.update({
      where: {
        userId: user.userId,
      },
      data: user,
    });

    res.status(200).json({
      status: "success",
      message: "Password changed successfully",
    });
  }
);

export const getUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.userId;

    if (!userId) {
      return next(new AppError("Please provide userId", 400));
    }

    const user = await User.findFirst({
      where: {
        userId: { equals: userId },
      },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        role: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
        AccessTokens: {
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!user) {
      return next(new AppError("we couldn't find user with userId", 404));
    }

    res.status(200).json({
      status: "success",
      message: "User fetched successfully",
      data: { user: user },
    });
  }
);