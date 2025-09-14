import { Router } from "express";
import { bookingControllerV2 } from "../controllers/bookingControllerV2.js";

const router = Router();

router.post(
  "/car-recovery/:serviceType",
  bookingControllerV2.createCarRecoveryBooking
);

router.post("/:bookingId/broadcast", bookingControllerV2.broadcastBooking);

export { router as bookingRoutesV2 };
