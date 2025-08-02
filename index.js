// Importing required modules and configurations
const dotenv = require("dotenv");
dotenv.config({path:'./.env'});
const express = require("express");
const cookieParser = require("cookie-parser");
const errorHandler = require("./middlewares/errorMiddleware"); // Import error handling middleware
const connectDB = require("./config/connectDB");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");
const driversRoutes = require("./routes/driversRoutes"); // Updated from vehicleRoutes
require("colors");

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