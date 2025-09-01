// Importing mongoose for MongoDB connection
import mongoose from "mongoose";

// Connection pool configuration options
const connectionOptions = {
  // Connection pool settings
  maxPoolSize: 10, // Maximum number of connections in the pool
  minPoolSize: 2,  // Minimum number of connections in the pool
  maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
  serverSelectionTimeoutMS: 5000, // How long to try selecting a server
  socketTimeoutMS: 45000, // How long a send or receive on a socket can take
  
  // Connection behavior
  bufferCommands: false, // Disable mongoose buffering
  
  // Retry logic
  retryWrites: true, // Enable retryable writes
  retryReads: true,  // Enable retryable reads
  
  // Heartbeat and monitoring
  heartbeatFrequencyMS: 10000, // How often to check server status
  
  // Additional performance options
  compressors: ['zlib'], // Enable compression
  zlibCompressionLevel: 6 // Compression level (1-9)
};

// Function to establish connection to MongoDB with connection pooling
const connectDB = async () => {
  try {
    // Set mongoose options for better performance
    mongoose.set('strictQuery', false);
    
    // Connect with connection pooling options
    await mongoose.connect(process.env.MONGO_URL, connectionOptions);
    
    console.log("Connected to MongoDB with connection pooling".green);
    
    // Log connection pool status
    const db = mongoose.connection.db;
    console.log(`Connection pool configured: maxPoolSize=${connectionOptions.maxPoolSize}, minPoolSize=${connectionOptions.minPoolSize}`.cyan);
    
  } catch (err) {
    console.error("MongoDB connection error:", err.message.red);
    process.exit(1); // Exit process with failure
  }
};

export default connectDB;
