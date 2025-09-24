// Importing mongoose for MongoDB connection
import mongoose from "mongoose";

// Connection pool configuration options
const connectionOptions = {
  // Server selection and connection settings
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  
  // Connection pool settings
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  
  // Connection behavior
  bufferCommands: false,
  
  // Retry logic
  retryWrites: true,
  retryReads: true,
  
  // Performance options
  compressors: ['zlib'],
  zlibCompressionLevel: 6,
  
  // Additional options
  family: 4,
  autoIndex: true,
  maxConnecting: 5
};

// Function to establish connection to MongoDB with connection pooling
const connectDB = async () => {
  try {
    // Set mongoose options for better performance
    mongoose.set('strictQuery', false);
    
    console.log("Connecting to MongoDB...".yellow);
    
    // Connect with connection pooling options
    await mongoose.connect(process.env.MONGO_URL, connectionOptions);
    
    console.log("Connected to MongoDB with connection pooling".green);
    
    // Get the underlying MongoDB driver connection
    const db = mongoose.connection.db;
    
    try {
      // Try to get server status (works if user has admin privileges)
      const adminDb = db.admin();
      const serverStatus = await adminDb.serverStatus();
      
      console.log(`MongoDB Server Version: ${serverStatus.version}`.cyan);
      
      if (serverStatus.connections) {
        console.log(`Active connections: ${serverStatus.connections.current}`.cyan);
        console.log(`Available connections: ${serverStatus.connections.available}`.cyan);
      }
    } catch (adminError) {
      // Non-admin users won't have access to serverStatus
      console.log('Note: Running without admin privileges - limited connection info'.yellow);
    }
    
    // Handle connection events
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to DB'.green);
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:'.red, err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('Mongoose connection disconnected'.yellow);
    });
    
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('Mongoose default connection disconnected through app termination'.yellow);
      process.exit(0);
    });
    
    return mongoose.connection;
    
  } catch (err) {
    console.error("MongoDB connection error:".red, err.message);
    // Close any existing connections
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

export default connectDB;
