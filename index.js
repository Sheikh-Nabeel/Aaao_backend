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
import mlmRoutes from "./routes/mlmRoutes.js"; // Added MLM routes
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

const allowedOrigins = ["https://aaago-frontend.vercel.app","https://aaaogo.com","http://localhost:5173","http://localhost:5174"];

app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or Postman)
            if (!origin) return callback(null, true);

            if (!allowedOrigins.includes(origin)) {
                const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
                return callback(new Error(msg), false);
            }

            return callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
        exposedHeaders: ['Set-Cookie']
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/user", userRoutes);
app.use("/api/drivers", driversRoutes);
app.use("/api/bookings", bookingRoutes); // Added booking routes
app.use("/api/mlm", mlmRoutes); // Added MLM routes

connectDB();

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server started on port: ${PORT}`.cyan.bold)
);
