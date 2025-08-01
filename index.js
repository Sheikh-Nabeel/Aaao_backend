// Importing required modules and configurations
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import errorHandler from "./middlewares/errorMiddleware.js"; // Import error handling middleware
import connectDB from "./config/connectDB.js";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import driversRoutes from "./routes/driversRoutes.js"; // Updated from vehicleRoutes
import "colors";

// Initialize Express app
const app = express();

// Middleware setup for CORS, JSON parsing, URL-encoded data, and cookies
app.use(cors({ origin: true, credentials: true })); // Allow all origins with credentials
app.use(express.json()); // Parses JSON request bodies
app.use(express.urlencoded({ extended: true })); // Enables extended parsing for form data
app.use(cookieParser()); // Parse cookies

// Apply user and drivers routes
app.use("/api/user", userRoutes);
app.use("/api/drivers", driversRoutes); // Updated from /api/vehicle

// Connect to MongoDB database
connectDB();

// Apply global error handling middleware
app.use(errorHandler);

// Start the server on the specified port
app.listen(process.env.PORT, () =>
  console.log(`Server started on port:${process.env.PORT.yellow}`)
);