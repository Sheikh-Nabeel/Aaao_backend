import userRoutes from ".//userRoutes.js";
import driversRoutes from ".//driversRoutes.js";
import vehiclesRoutes from ".//vehiclesRoutes.js";
import bookingRoutes from ".//bookingRoutes.js"; // Added booking routes
import mlmRoutes from ".//mlmRoutes.js"; // Added MLM routes
import vehicleHiringRoutes from ".//vehicleHiringRoutes.js"; // Added vehicle hiring routes
import postRoutes from ".//postRoutes.js"; // Added post routes

import adminPricingRoutes from ".//adminPricingRoutes.js"; // Added admin pricing routes
import adminComprehensivePricingRoutes from ".//adminComprehensivePricingRoutes.js"; // Added comprehensive pricing routes
import appointmentRoutes from ".//appointmentRoutes.js"; // Added appointment routes
import fareEstimationRoutes from ".//fareEstimationRoutes.js"; // Added fare estimation routes
import walletRoutes from ".//walletRoutes.js"; // Added wallet routes
import emailVerificationRoutes from ".//emailVerificationRoutes.js"; // Added email verification routes
import driverStatusRoutes from ".//driverStatusRoutes.js"; // Added driver status routes
import qualifiedDriversRoutes from ".//qualifiedDriversRoutes.js"; // Added qualified drivers routes
import offerRoutes from ".//offerRoutes.js"; // Added qualified drivers routes
import supportTicketRoutes from ".//supportTicketRoutes.js"; // Added support ticket routes
import errorHandler from "../middlewares/errorMiddleware.js";

export function initRoutes(app) {
  app.use("/api/user", userRoutes);
  app.use("/api/drivers", driversRoutes);
  app.use("/api/vehicles", vehiclesRoutes);
  app.use("/api/bookings", bookingRoutes); // Added booking routes
  app.use("/api/mlm", mlmRoutes); // Added MLM routes
  app.use("/api/vehicle-hiring", vehicleHiringRoutes);
  app.use("/api/posts", postRoutes); // Added post routes
  app.use("/api/admin/pricing", adminPricingRoutes); // Added admin pricing routes
  app.use("/api/admin/comprehensive-pricing", adminComprehensivePricingRoutes); // Added comprehensive pricing routes
  app.use("/api/appointments", appointmentRoutes); // Added appointment routes
  app.use("/api/fare", fareEstimationRoutes); // Added fare estimation routes
  app.use("/api/wallet", walletRoutes); // Added wallet routes
  app.use("/api/email-verification", emailVerificationRoutes); // Added email verification routes
  app.use("/api/driver-status", driverStatusRoutes); // Added driver status routes
  app.use("/api/qualified-drivers", qualifiedDriversRoutes); // Added qualified drivers routes
  app.use("/api/nearby-drivers", qualifiedDriversRoutes); // Added nearby drivers routes
  app.use("/api/offers", offerRoutes); // Correct
  app.use("/api/support", supportTicketRoutes); // Added support ticket routes

  app.use(errorHandler);
}
