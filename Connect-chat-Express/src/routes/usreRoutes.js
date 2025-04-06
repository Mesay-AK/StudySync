import express from "express";

import { getUserProfile, updateUserProfile, deleteProfile, getUserStatus, updateUserStatus  } from "../controllers/userController.js";
import { authenticateToken, validateUser, checkOwnershipOrAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/:userId",authenticateToken, validateUser, getUserProfile); 
router.patch("/:userId",authenticateToken,checkOwnershipOrAdmin, updateUserProfile); 
router.get("/:userId/status",authenticateToken, getUserStatus); 
router.patch("/:userId/status",authenticateToken,checkOwnershipOrAdmin, updateUserStatus); 
router.delete("/:userId",authenticateToken,checkOwnershipOrAdmin, deleteProfile);
router.get("/admin/all-users", authenticateToken, authorizeRoles("admin"), getAllUsers);


export default router;
