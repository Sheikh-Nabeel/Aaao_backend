import userRoutes from ".//userRoutes.js";
import driversRoutes from ".//driversRoutes.js";
import vehiclesRoutes from ".//vehiclesRoutes.js";
import bookingRoutes from ".//bookingRoutes.js";
import mlmRoutes from ".//mlmRoutes.js";
import vehicleHiringRoutes from ".//vehicleHiringRoutes.js";
import postRoutes from ".//postRoutes.js";
import carRecoveryRoutes from "./carRecoveryRoutes.js";

import adminPricingRoutes from ".//adminPricingRoutes.js";
import adminComprehensivePricingRoutes from ".//adminComprehensivePricingRoutes.js";
import appointmentRoutes from ".//appointmentRoutes.js";
import fareEstimationRoutes from ".//fareEstimationRoutes.js";
import walletRoutes from ".//walletRoutes.js";
import emailVerificationRoutes from ".//emailVerificationRoutes.js";
import driverStatusRoutes from ".//driverStatusRoutes.js";
import qualifiedDriversRoutes from ".//qualifiedDriversRoutes.js";
import offerRoutes from ".//offerRoutes.js";
import supportTicketRoutes from ".//supportTicketRoutes.js";
import errorHandler from "../middlewares/errorMiddleware.js";
import adminAuthRoutes from ".//adminAuthRoutes.js";
import adminUserRoutes from "./adminUserRoutes.js";

export function initRoutes(app) {
  app.use("/api/user", userRoutes);
  app.use("/api/drivers", driversRoutes);
  app.use("/api/vehicles", vehiclesRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/mlm", mlmRoutes);
  app.use("/api/vehicle-hiring", vehicleHiringRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/car-recovery", carRecoveryRoutes);

  app.use("/api/admin/pricing", adminPricingRoutes);
  app.use("/api/admin/comprehensive-pricing", adminComprehensivePricingRoutes);
  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/fare", fareEstimationRoutes);
  app.use("/api/wallet", walletRoutes);
  app.use("/api/email-verification", emailVerificationRoutes);
  app.use("/api/driver-status", driverStatusRoutes);
  app.use("/api/qualified-drivers", qualifiedDriversRoutes);
  app.use("/api/nearby-drivers", qualifiedDriversRoutes);
  app.use("/api/offers", offerRoutes);
  app.use("/api/support", supportTicketRoutes);

  app.use("/api/admin/users", adminUserRoutes);

  app.use(errorHandler);
}
