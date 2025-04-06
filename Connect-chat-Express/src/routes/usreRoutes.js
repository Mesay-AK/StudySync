import express from "express";

import { getUserProfile, updateUserProfile, deleteProfile, getUserStatus, updateUserStatus  } from "../controllers/userController.js";

const router = express.Router();

router.get("/:userId", getUserProfile); 
router.patch("/:userId", updateUserProfile); 
router.get("/:userId/status", getUserStatus); 
router.patch("/:userId/status", updateUserStatus); 
router.delete("/:userId", deleteProfile);

export default router;
