import express from "express";

import { getUserProfile, updateUserProfile, deleteProfile, getUserStatus, updateUserStatus  } from "../controllers/userController.js";
import { authenticateToken, validateUser, checkOwnershipOrAdmin } from "../middleware/authMiddleware.js";

const userRouter = express.Router();

userRouter.get("/:userId",authenticateToken, validateUser, getUserProfile); 
userRouter.patch("/:userId",authenticateToken,checkOwnershipOrAdmin, updateUserProfile); 
userRouter.get("/:userId/status",authenticateToken, getUserStatus); 
userRouter.patch("/:userId/status",authenticateToken,checkOwnershipOrAdmin, updateUserStatus); 
userRouter.delete("/:userId",authenticateToken,checkOwnershipOrAdmin, deleteProfile);
userRouter.get("/admin/all-users", authenticateToken, authorizeRoles("admin"), getAllUsers);


export default userRouter;
