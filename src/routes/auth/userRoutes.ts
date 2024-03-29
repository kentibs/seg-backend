import express from "express";
import {
  signUpAdmin,
  signIn,
  resetPassword,
  forgotPassword,
  changePassword,
  editUserDetails,
  updateUserImage,
  protect,
  getUser,
  signUp,
  getUsersOfRoleUser,
  getUsersOfRoleAdmin,
} from "../../controllers/userController";
import { uploadFile } from "../../utils/upload";
import { validateSignupToken } from "../../controllers/tokenController";

const router = express.Router();

router.post("/signup", validateSignupToken, signUpAdmin);
router.post("/signup-user", signUp);
router.post("/signin", signIn);
router.post("/forgot-password", forgotPassword);
router.patch("/reset-password/:token", resetPassword);
router.patch("/edit-user-details/:userId", protect, editUserDetails);
router.patch(
  "/upload-user-image/:userId",
  uploadFile,
  protect,
  updateUserImage
);
router.patch("/change-password/:userId", protect, changePassword);
router.get("/get-user/:userId", getUser);
router.get("/get-users-by-role-user", protect, getUsersOfRoleUser);
router.get("/get-users-by-role-admin", protect, getUsersOfRoleAdmin);

export { router as userRoutes };
