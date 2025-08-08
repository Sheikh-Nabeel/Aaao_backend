import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import express from "express";
import cookieParser from "cookie-parser";
import errorHandler from "./middlewares/errorMiddleware.js";
import connectDB from "./config/connectDB.js";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import driversRoutes from "./routes/driversRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js"; // Added booking routes
import cloudinary from "cloudinary";
import "colors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Cloudinary Config:", {
  Cloud_Name: process.env.Cloud_Name,
  API_Key: process.env.API_Key,
  API_Secret: process.env.API_Secret,
});

cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});

const app = express();

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

cloudinary.v2.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/user", userRoutes);
app.use("/api/drivers", driversRoutes);
app.use("/api/bookings", bookingRoutes); // Added booking routes

connectDB();

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server started on port: ${PORT}`.cyan.bold)
);
