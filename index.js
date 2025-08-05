import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import express from "express";
import cookieParser from "cookie-parser";
import errorHandler from "./middlewares/errorMiddleware.js";
import connectDB from "./config/connectDB.js";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import driversRoutes from "./routes/driversRoutes.js";
import cloudinary from "cloudinary"; // Import Cloudinary
import "colors";

console.log("Cloudinary Config:", {
  Cloud_Name: process.env.Cloud_Name,
  API_Key: process.env.API_Key,
  API_Secret: process.env.API_Secret,
});

// Configure Cloudinary here
cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/user", userRoutes);
app.use("/api/drivers", driversRoutes);

connectDB();

app.use(errorHandler);

app.listen(process.env.PORT, () =>
  console.log(`Server started on port:${process.env.PORT}`)
);
