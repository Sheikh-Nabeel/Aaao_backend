import express from "express";
import auth from "../middlewares/authMIddleware.js";
import admin from "../middlewares/adminMiddleware.js";
import {
  listUsers,
  getUserById,
  updateUserRole,
} from "../controllers/adminUserController.js";

const router = express.Router();

// Secure all routes
router.use(auth);
router.use(admin);

router.get("/", listUsers);
router.get("/:id", getUserById);
router.put("/:id/role", updateUserRole);

export default router;
