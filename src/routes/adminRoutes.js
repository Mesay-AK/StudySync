import express from "express";
import {
    viewReports,
    resolveReport,
    deleteUser,
    banUser,
    unbanUser,
    promoteToRoomAdmin,
    demoteFromRoomAdmin, 
} from "../controllers/adminController.js";
import { isAdmin } from "../middlewares/isAdmin.js";
import { authenticate, validateUser } from "../middlewares/authMiddleware.js";

const adminRouter = express.Router();
router.use(authenticate, validateUser, isAdmin);

adminRouter.get("/reports", viewReports);
adminRouter.post("/resolve-report", resolveReport);
adminRouter.post("/delete-user", deleteUser);
adminRouter.post("/ban-user", banUser);
adminRouter.post("/unban-user", unbanUser);


router.use(isAuthenticated);

router.post("/promote", promoteToRoomAdmin);
router.post("/demote", demoteFromRoomAdmin);

export default adminRouter;
