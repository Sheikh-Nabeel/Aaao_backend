import { io } from 'socket.io-client';

// Connect to the server
const socket = io('http://localhost:3001', {
  auth: {
    token: 'test-token' // This might need to be a real token
  }
});

socket.on('connect', () => {
  console.log('Connected to server with socket ID:', socket.id);
  
  // Wait a moment for authentication
  setTimeout(() => {
    console.log('Requesting qualified drivers...');
    
    // Emit the qualified drivers request
    socket.emit('request_qualified_drivers', {
      latitude: 24.8607,
      longitude: 67.0011,
      serviceType: 'car',
      vehicleType: 'economy',
      driverPreference: 'nearby'
    });
  }, 2000);
});

socket.on('qualified_drivers_response', (data) => {
  console.log('Qualified drivers response:', JSON.stringify(data, null, 2));
  process.exit(0);
});

socket.on('error', (error) => {
  console.log('Socket error:', error);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

// Exit after 10 seconds if no response
setTimeout(() => {
  console.log('Timeout - exiting');
  process.exit(1);
}, 10000);