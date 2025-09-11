import { allowedOrigins } from "../config/config.js";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initMiddlewares(app) {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use("/uploads", express.static(join(__dirname, "..", "uploads")));

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
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
      exposedHeaders: ["Set-Cookie"],
    })
  );

  // Serve static files (including index.html)
  app.use(express.static(__dirname));
}
