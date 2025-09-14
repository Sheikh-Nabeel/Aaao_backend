import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";

export const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.query.token;

    if (!token) {
      console.log("Socket connection rejected: No token provided".red);
      return next(new Error("Authentication error: No token provided"));
    }

    if (!socket.handshake.query.lat || !socket.handshake.query.lng) {
      console.log("Socket connection rejected: Location not provided".red);
      return next(new Error("Authentication error: Location not provided"));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user in database
    const user = await userModel.findById(decoded.id).select("-password");

    if (!user) {
      console.log("Socket connection rejected: User not found".red);
      return next(new Error("Authentication error: User not found"));
    }

    // Attach user to socket
    socket.user = user;
    socket.location = {
      lat: parseFloat(socket.handshake.query.lat),
      lng: parseFloat(socket.handshake.query.lng),
    };
    console.log(`Socket authenticated for user: ${user.email}`.green);

    next();
  } catch (error) {
    console.log(`Socket authentication failed: ${error.message}`.red);
    next(new Error("Authentication error: Invalid token"));
  }
};
