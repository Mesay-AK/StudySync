import express from "express";
import {
  getUserProfile,
  updateUserProfile,
  getUserStatus,
  updateUserStatus,
  deleteProfile,
  getAllUsers,
  getBlockedUsers,
  blockUser,
  unblockUser,
  searchUsers,
  getUserSettings,
  updateUserSettings,

} from "../controllers/adminController.js";


import {authenticate,
      authorizeRoles, 
      checkOwnershipOrAdmin, 
      validateUser}      
from "../middleware/authMiddleware.js";
  


const userRouter = express.Router();

userRouter.get("/:userId", authenticate, validateUser, getUserProfile);
userRouter.patch("/:userId", authenticate, checkOwnershipOrAdmin, updateUserProfile);
userRouter.get("/:userId/status", authenticate, getUserStatus);
userRouter.patch("/:userId/status", authenticate, checkOwnershipOrAdmin, updateUserStatus);
userRouter.delete("/:userId", authenticate, checkOwnershipOrAdmin, deleteProfile);

userRouter.post("/block", authenticate, checkOwnershipOrAdmin, blockUser);

userRouter.get("/admin/all-users", authenticate, authorizeRoles("admin"), getAllUsers);
userRouter.get("/blocked/:userId", authenticate, checkOwnershipOrAdmin, getBlockedUsers);
userRouter.patch("/unblock/:userId", authenticate, checkOwnershipOrAdmin, unblockUser);
userRouter.get("/search", authenticate, searchUsers);
userRouter.get("/settings/:userId", authenticate, getUserSettings);
userRouter.patch("/settings/:userId", authenticate, checkOwnershipOrAdmin, updateUserSettings);

export default userRouter;
