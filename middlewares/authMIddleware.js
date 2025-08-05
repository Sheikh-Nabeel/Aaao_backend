// Importing required modules for handling asynchronous operations and JWT
import handler from "express-async-handler";
import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";

// Authentication middleware to verify JWT tokens from Authorization header or cookies
const authHandler = handler(async (req, res, next) => {
  console.log("=== AUTH DEBUG ===");
  
  let token = req.headers.authorization; // Extract token from Authorization header
  let tokenSource = "header";
  
  // If no token in header, try to get from cookies
  if (!token) {
    token = req.cookies.token;
    tokenSource = "cookies";
  }

  if (!token) {
    console.log("No token found");
    res.status(401);
    throw new Error("Token not found");
  }

  // Remove "Bearer " prefix if present (only for Authorization header)
  if (tokenSource === "header" && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  console.log(`Using token from ${tokenSource}:`, token.substring(0, 20) + "...");

  try {
    // Verify the token using the secret key from environment variables
    let decode = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token decoded successfully for user ID:", decode.id);

    // Find the user in the database using the decoded ID from the token
    req.user = await userModel.findById(decode.id);

    // If user is not found, throw an error
    if (!req.user) {
      console.log("User not found in database");
      res.status(401);
      throw new Error("User not found");
    }

    console.log("Authentication successful for user:", req.user.email);
    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    console.log("Token verification error:", error.message);
    
    // If header token failed and we haven't tried cookies yet, try cookies
    if (tokenSource === "header" && req.cookies.token && req.cookies.token !== token) {
      console.log("Trying cookie token as fallback...");
      try {
        let cookieToken = req.cookies.token;
        let decode = jwt.verify(cookieToken, process.env.JWT_SECRET);
        req.user = await userModel.findById(decode.id);
        
        if (req.user) {
          console.log("Authentication successful with cookie token for user:", req.user.email);
          next();
          return;
        }
      } catch (cookieError) {
        console.log("Cookie token also failed:", cookieError.message);
      }
    }
    
    res.status(401);
    throw new Error("Invalid Token");
  }
});

export default authHandler;
