import express from "express";

import { blockUser,
         deleteProfile,
         unblockUser,
         getAllUsers,
         getBlockedUsers,
         searchUsers,
         getUserSettings,
         updateUserSettings,
         getUserProfile,
         updateUserProfile,
         getUserStatus,
         updateUserStatus,
         
} from "../controllers/userController.js";

import {authenticate,
      requireAdmin,
      checkOwnershipOrAdmin}
from "../middleware/authMiddleware.js";



const userRouter = express.Router();

// Static/specific routes must come before "/:userId" so they aren't swallowed by it.
userRouter.get("/search", authenticate, searchUsers);
userRouter.get("/admin/all-users", authenticate, requireAdmin, getAllUsers);

userRouter.post("/block", authenticate, blockUser);
userRouter.patch("/unblock/:userId", authenticate, checkOwnershipOrAdmin(), unblockUser);
userRouter.get("/blocked/:userId", authenticate, checkOwnershipOrAdmin(), getBlockedUsers);

userRouter.get("/settings/:userId", authenticate, checkOwnershipOrAdmin(), getUserSettings);
userRouter.patch("/settings/:userId", authenticate, checkOwnershipOrAdmin(), updateUserSettings);

userRouter.get("/:userId/status", authenticate, getUserStatus);
userRouter.patch("/:userId/status", authenticate, checkOwnershipOrAdmin(), updateUserStatus);
userRouter.get("/:userId", authenticate, getUserProfile);
userRouter.patch("/:userId", authenticate, checkOwnershipOrAdmin(), updateUserProfile);
userRouter.delete("/:userId", authenticate, checkOwnershipOrAdmin(), deleteProfile);

export default userRouter;
