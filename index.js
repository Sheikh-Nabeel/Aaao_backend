import "dotenv/config";

import express from "express";
import { createServer } from "http";
import connectDB from "./config/connectDB.js";
import cloudinary from "cloudinary";
import { handleBookingEvents } from "./utils/socketHandlers.js";
import queryOptimizer from "./utils/queryOptimizer.js";
import { initRoutes } from "./routes/index.js";
import { initMiddlewares } from "./middlewares/index.js";
import "colors";
import { redisService } from "./services/redis.js";
import { initSocket } from "./socket/index.js";

cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});
cloudinary.v2.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});

const app = express();
const server = createServer(app);

initMiddlewares(app);
initRoutes(app);
const io = initSocket(server);

// Initialize server function
const initializeServer = async () => {
  try {
    await connectDB();

    // Generate performance report every 30 minutes
    // !! move this to cron job
    setInterval(() => {
      const report = queryOptimizer.generatePerformanceReport();
      console.log("📊 Performance Report:".cyan, report);
    }, 30 * 60 * 1000);

    // Socket.IO connection handling
    io.on("connection", (socket) => {
      console.log(
        `Authenticated user connected: ${socket.id} - ${socket.user.email}`
          .green
      );

      // Join user to their personal room (using authenticated user ID)
      socket.on("join_user_room", (userId) => {
        // Check if userId is provided
        if (!userId) {
          socket.emit("error", { message: "User ID is required to join room" });
          return;
        }

        // Verify the userId matches the authenticated user
        if (socket.user._id.toString() !== userId.toString()) {
          socket.emit("error", {
            message: "Unauthorized: Cannot join room for different user",
          });
          return;
        }

        socket.join(`user_${userId}`);
        console.log(
          `User ${socket.user.email} joined room user_${userId}`.yellow
        );
        socket.emit("room_joined", {
          room: `user_${userId}`,
          message: "Successfully joined user room",
        });
      });

      // Join driver to their personal room (using authenticated user ID)
      socket.on("join_driver_room", (driverId) => {
        // Check if driverId is provided
        if (!driverId) {
          socket.emit("error", {
            message: "Driver ID is required to join room",
          });
          return;
        }

        // Verify the driverId matches the authenticated user and user is a driver
        if (socket.user._id.toString() !== driverId.toString()) {
          socket.emit("error", {
            message: "Unauthorized: Cannot join room for different driver",
          });
          return;
        }

        if (socket.user.role !== "driver") {
          socket.emit("error", {
            message: "Unauthorized: Only drivers can join driver rooms",
          });
          return;
        }

        socket.join(`driver_${driverId}`);
        console.log(
          `Driver ${socket.user.email} joined room driver_${driverId}`.yellow
        );
        socket.emit("room_joined", {
          room: `driver_${driverId}`,
          message: "Successfully joined driver room",
        });
      });

      // Handle booking events with authenticated user context
      handleBookingEvents(socket, io);

      // Handle disconnection
      socket.on("disconnect", () => {
        console.log(
          `Authenticated user disconnected: ${socket.id} - ${socket.user.email}`
            .red
        );
      });
    });

    // Make io accessible to other modules
    app.set("io", io);

    const PORT = process.env.PORT || 3003;
    server.listen(PORT, () =>
      console.log(`🚀 Server started successfully on port: ${PORT}`.cyan.bold)
    );
  } catch (error) {
    console.error("Failed to initialize server:", error.message.red);
    process.exit(1);
  }
};

// Initialize the server
initializeServer();

// Export io for use in other modules
export { io };
