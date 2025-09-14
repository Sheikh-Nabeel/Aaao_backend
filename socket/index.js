import { Server } from "socket.io";
import { allowedOrigins } from "../config/config.js";
import { authenticateSocket } from "./middlewares.js";

let io = null;

export const initSocket = (server) => {
  if (io) return io;
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    },
  });

  io.use(authenticateSocket);

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};
