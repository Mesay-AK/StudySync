import express from "express";
import { isAdmin } from "../middlewares/adminMiddleware.js";
import { viewReports, resolveReport, deleteUser } from "../controllers/adminController.js";

const adminRouter = express.Router();

adminRouter.use(isAdmin);  // Protect all routes below this with admin auth

// Get all reports
adminRouter.get("/reports", viewReports);

// Resolve a report (Delete message or Ban user)
adminRouter.post("/resolveReport", resolveReport);

// Delete a user
adminRouter.post("/deleteUser", deleteUser);

export default adminRouter;
