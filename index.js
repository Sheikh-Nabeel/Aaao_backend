import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import errorHandler from "./middlewares/errorMiddleware.js";
import connectDB from "./config/connectDB.js";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import driversRoutes from "./routes/driversRoutes.js";
import vehiclesRoutes from "./routes/vehiclesRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js"; // Added booking routes
import mlmRoutes from "./routes/mlmRoutes.js"; // Added MLM routes
import vehicleHiringRoutes from "./routes/vehicleHiringRoutes.js"; // Added vehicle hiring routes

import adminPricingRoutes from "./routes/adminPricingRoutes.js"; // Added admin pricing routes
import adminComprehensivePricingRoutes from "./routes/adminComprehensivePricingRoutes.js"; // Added comprehensive pricing routes
import appointmentRoutes from "./routes/appointmentRoutes.js"; // Added appointment routes
import fareEstimationRoutes from "./routes/fareEstimationRoutes.js"; // Added fare estimation routes
import walletRoutes from "./routes/walletRoutes.js"; // Added wallet routes
import emailVerificationRoutes from "./routes/emailVerificationRoutes.js"; // Added email verification routes
import driverStatusRoutes from "./routes/driverStatusRoutes.js"; // Added driver status routes
import qualifiedDriversRoutes from "./routes/qualifiedDriversRoutes.js"; // Added qualified drivers routes

import cloudinary from "cloudinary";
import "colors";
import path from "path";
import { fileURLToPath } from "url";
import { handleBookingEvents } from "./utils/socketHandlers.js";
import { initializeDriverStatusSocket } from "./utils/driverStatusSocket.js";
import jwt from "jsonwebtoken";
import userModel from "./models/userModel.js";
import queryOptimizer from "./utils/queryOptimizer.js";

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
const allowedOrigins = ["https://aaago-frontend.vercel.app","https://aaaogo.com","http://localhost:5173","http://localhost:5174","http://localhost:3001","http://127.0.0.1","https://aaaogo.com","https://aaaogodashboard.netlify.app"];

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  },
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

cloudinary.v2.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});


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

// Serve static files (including index.html)
app.use(express.static(__dirname));

app.use("/api/user", userRoutes);
app.use("/api/drivers", driversRoutes);
app.use("/api/vehicles", vehiclesRoutes);
app.use("/api/bookings", bookingRoutes); // Added booking routes
app.use("/api/mlm", mlmRoutes); // Added MLM routes
app.use("/api/vehicle-hiring", vehicleHiringRoutes);
app.use("/api/admin/pricing", adminPricingRoutes); // Added admin pricing routes
app.use("/api/admin/comprehensive-pricing", adminComprehensivePricingRoutes); // Added comprehensive pricing routes
app.use("/api/appointments", appointmentRoutes); // Added appointment routes
app.use("/api/fare", fareEstimationRoutes); // Added fare estimation routes
app.use("/api/wallet", walletRoutes); // Added wallet routes
app.use("/api/email-verification", emailVerificationRoutes); // Added email verification routes
app.use("/api/driver-status", driverStatusRoutes); // Added driver status routes
app.use("/api/qualified-drivers", qualifiedDriversRoutes); // Added qualified drivers routes
app.use("/api/nearby-drivers", qualifiedDriversRoutes); // Added nearby drivers routes

// Initialize server function
const initializeServer = async () => {
  try {
    await connectDB();
    
    // Generate performance report every 30 minutes
    setInterval(() => {
      const report = queryOptimizer.generatePerformanceReport();
      console.log('📊 Performance Report:'.cyan, report);
    }, 30 * 60 * 1000);
    
    app.use(errorHandler);
    
    // Socket.IO authentication middleware
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
    
    if (!token) {
      console.log('Socket connection rejected: No token provided'.red);
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user in database
    const user = await userModel.findById(decoded.id).select('-password');
    
    if (!user) {
      console.log('Socket connection rejected: User not found'.red);
      return next(new Error('Authentication error: User not found'));
    }

    // Attach user to socket
    socket.user = user;
    console.log(`Socket authenticated for user: ${user.email}`.green);
    
    next();
  } catch (error) {
    console.log(`Socket authentication failed: ${error.message}`.red);
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Authenticated user connected: ${socket.id} - ${socket.user.email}`.green);

  // Join user to their personal room (using authenticated user ID)
  socket.on('join_user_room', (userId) => {
    // Check if userId is provided
    if (!userId) {
      socket.emit('error', { message: 'User ID is required to join room' });
      return;
    }
    
    // Verify the userId matches the authenticated user
    if (socket.user._id.toString() !== userId.toString()) {
      socket.emit('error', { message: 'Unauthorized: Cannot join room for different user' });
      return;
    }
    
    socket.join(`user_${userId}`);
    console.log(`User ${socket.user.email} joined room user_${userId}`.yellow);
    socket.emit('room_joined', { room: `user_${userId}`, message: 'Successfully joined user room' });
  });

  // Join driver to their personal room (using authenticated user ID)
  socket.on('join_driver_room', (driverId) => {
    // Check if driverId is provided
    if (!driverId) {
      socket.emit('error', { message: 'Driver ID is required to join room' });
      return;
    }
    
    // Verify the driverId matches the authenticated user and user is a driver
    if (socket.user._id.toString() !== driverId.toString()) {
      socket.emit('error', { message: 'Unauthorized: Cannot join room for different driver' });
      return;
    }
    
    if (socket.user.role !== 'driver') {
      socket.emit('error', { message: 'Unauthorized: Only drivers can join driver rooms' });
      return;
    }
    
    socket.join(`driver_${driverId}`);
    console.log(`Driver ${socket.user.email} joined room driver_${driverId}`.yellow);
    socket.emit('room_joined', { room: `driver_${driverId}`, message: 'Successfully joined driver room' });
  });

  // Handle booking events with authenticated user context
  handleBookingEvents(socket, io);

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Authenticated user disconnected: ${socket.id} - ${socket.user.email}`.red);
    });
});

// Initialize driver status socket handlers
initializeDriverStatusSocket(io);
  
  // Make io accessible to other modules
  app.set('io', io);
  
  const PORT = process.env.PORT || 3003;
  server.listen(PORT, () =>
    console.log(`🚀 Server started successfully on port: ${PORT}`.cyan.bold)
  );
  
  } catch (error) {
    console.error('Failed to initialize server:', error.message.red);
    process.exit(1);
  }
};

// Initialize the server
initializeServer();

// Export io for use in other modules
export { io };


