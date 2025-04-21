import express from "express";
import {
    registerAdmin,
    viewReports,
    resolveReport,
    deleteUser,
    toggleBanUser,
    promoteToRoomAdmin,
    demoteFromRoomAdmin, 
} from "../controllers/adminController.js";
import { checkRoomAdmin } from "../middleware/adminMiddleware.js";
import { authenticate, validateUser } from "../middleware/authMiddleware.js";

const adminRouter = express.Router();
adminRouter.use(authenticate, validateUser,  checkRoomAdmin);

adminRouter.post("/adRegister", registerAdmin);
adminRouter.get("/reports", viewReports);
adminRouter.post("/resolve-report", resolveReport);
adminRouter.post("/delete-user", deleteUser);
adminRouter.post("/toggle-user", toggleBanUser);
adminRouter.patch("/promote", promoteToRoomAdmin);
adminRouter.patch("/demote", demoteFromRoomAdmin);
adminRouter.post("/promote", promoteToRoomAdmin);
adminRouter.post("/demote", demoteFromRoomAdmin);

export default adminRouter;
