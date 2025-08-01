// Importing required modules for handling asynchronous operations and JWT
import handler from "express-async-handler";
import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";

// Authentication middleware to verify JWT tokens from cookies
const authHandler = handler(async (req, res, next) => {
  let token = req.cookies.token; // Extract token from cookies

  if (!token) {
    res.status(401);
    throw new Error("Token not found");
  }

  try {
    // Verify the token using the secret key from environment variables
    let decode = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user in the database using the decoded ID from the token
    req.user = await userModel.findById(decode.id);

    // If user is not found, throw an error (handled by try-catch)
    if (!req.user) {
      res.status(401);
      throw new Error("User not found");
    }

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    // Handle token verification errors (e.g., expired or invalid token)
    res.status(401);
    throw new Error("Invalid Token");
  }
});

export default authHandler;
