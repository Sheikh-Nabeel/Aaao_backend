import express from "express";
import http from "http";
import dotenv from "dotenv";
import cors from "cors";
import jwt from "jsonwebtoken";
import userModel from "./models/userModel.js";
import queryOptimizer from "./utils/queryOptimizer.js";
import cloudinary from "cloudinary";
import { webSocketService } from "./services/websocketService.js";
import CarRecoverySocketService from "./services/carRecoverySocketService.js";
import connectDB from "./config/connectDB.js";
import "colors";
import { generateToken, verifyToken } from "./utils/jwt.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Cloudinary
cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});

// Configure CORS for Express
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://aaaogo.com",
    "https://aaaogodashboard.netlify.app",
    "https://dashboard.aaaogo.com"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Initialize middlewares and routes
import { initMiddlewares } from "./middlewares/index.js";
import { initRoutes } from "./routes/index.js";
initMiddlewares(app);
initRoutes(app);

// Connect to MongoDB
connectDB()
  .then(() => {
    console.log("MongoDB connected successfully".green.bold);

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.status(200).json({
        status: "ok",
        serverTime: new Date().toISOString(),
        uptime: process.uptime(),
        websocket: {
          connected: webSocketService.getConnectedUserIds().length,
          path: "/ws",
        },
        environment: process.env.NODE_ENV || "development",
        nodeVersion: process.version,
      });
    });

    // Verify token endpoint (kept)
    app.get("/verify-token", (req, res) => {
      const token = req.query.token;
      if (!token) {
        return res.status(400).json({ error: "No token provided" });
      }

      const { valid, decoded, error } = verifyToken(token);

      if (!valid) {
        return res.status(401).json({
          valid: false,
          error,
          message: "Invalid or expired token",
        });
      }

      res.json({
        valid: true,
        decoded,
        expiresAt: decoded.exp
          ? new Date(decoded.exp * 1000).toISOString()
          : null,
      });
    });

    try {
      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not set in environment variables");
      }

      console.log(
        "🔑 Using JWT_SECRET:",
        process.env.JWT_SECRET ? "Set" : "Not set"
      );

      // Initialize WebSocket server with JWT secret
      webSocketService.initialize(server, {
        path: "/ws",
        jwtSecret: process.env.JWT_SECRET,
      });

      // Initialize Car Recovery WebSocket service
      CarRecoverySocketService.initialize(webSocketService.wss);

      // Start the server
      const PORT = process.env.PORT || 3001;
      server.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Server running on port ${PORT}`.cyan);
        console.log(
          `🔌 WebSocket server running on ws://localhost:${PORT}/ws`.cyan
        );
      });
    } catch (error) {
      console.error(
        "❌ Failed to initialize WebSocket server:".red,
        error.message
      );
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("MongoDB connection error:".red, err);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.log(`Error: ${err.message}`.red);
  server.close(() => process.exit(1));
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...".yellow);
  server.close(() => {
    console.log("Process terminated".red);
    process.exit(0);
  });
});

export { webSocketService };
export default app;
