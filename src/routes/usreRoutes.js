import express from "express";
import {
  getUserProfile,
  updateUserProfile,
  deleteProfile,
  getUserStatus,
  updateUserStatus,
  getAllUsers,
  blockUser,
  reportMessaege,
  reportUser
} from "../controllers/userController.js";

import {
  authenticateToken,
  validateUser,
  checkOwnershipOrAdmin,
  authorizeRoles,
} from "../middleware/authMiddleware.js";


const userRouter = express.Router();

userRouter.get("/:userId", authenticateToken, validateUser, getUserProfile);
userRouter.patch("/:userId", authenticateToken, checkOwnershipOrAdmin, updateUserProfile);
userRouter.get("/:userId/status", authenticateToken, getUserStatus);
userRouter.patch("/:userId/status", authenticateToken, checkOwnershipOrAdmin, updateUserStatus);
userRouter.delete("/:userId", authenticateToken, checkOwnershipOrAdmin, deleteProfile);
router.post("/block", authenticateToken, checkOwnershipOrAdmin, blockUser);
router.post("/block", authenticateToken, checkOwnershipOrAdmin, reportMessaege);
router.post("/block", authenticateToken, checkOwnershipOrAdmin, reportUser);

// Admin route
userRouter.get("/admin/all-users", authenticateToken, authorizeRoles("admin"), getAllUsers);

export default userRouter;
