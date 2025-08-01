// Importing mongoose for MongoDB connection
import mongoose from "mongoose";

// Function to establish connection to MongoDB
const connectDB = () => {
  mongoose
    .connect(process.env.MONGO_URL) // Connects using the URL from environment variables
    .then(() => console.log("Connected to MongoDB".green)) // Logs success message
    .catch((err) =>
      console.error("MongoDB connection error:", err.message.red)
    ); // Logs error if connection fails
};

export default connectDB;
