import express from "express";
import {
    registerAdmin,
    viewReports,
    resolveReport,
    deleteUser,
    toggleBanUser,
    promoteToRoomAdmin,
    demoteFromRoomAdmin,
    setAdminRole,
} from "../controllers/adminController.js";
import { checkRoomAdmin } from "../middleware/adminMiddleware.js";
import { authenticate, requireAdmin, requireSuperAdmin } from "../middleware/authMiddleware.js";

const adminRouter = express.Router();

// Site-wide admin actions: gated on the caller's own isAdmin flag.
// Creating and promoting admins: super admins only.
adminRouter.post("/adRegister", authenticate, requireSuperAdmin, registerAdmin);
adminRouter.patch("/role", authenticate, requireSuperAdmin, setAdminRole);
adminRouter.get("/reports", authenticate, requireAdmin, viewReports);
adminRouter.post("/resolve-report", authenticate, requireAdmin, resolveReport);
adminRouter.post("/delete-user", authenticate, requireAdmin, deleteUser);
adminRouter.post("/toggle-user", authenticate, requireAdmin, toggleBanUser);

// Room-scoped admin actions: gated on being an admin of that specific room.
adminRouter.patch("/promote", authenticate, checkRoomAdmin, promoteToRoomAdmin);
adminRouter.patch("/demote", authenticate, checkRoomAdmin, demoteFromRoomAdmin);

export default adminRouter;
