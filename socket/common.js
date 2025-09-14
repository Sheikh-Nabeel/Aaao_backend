import { redisService } from "../services/redis.js";

export const onConnect = (socket) => {
  console.log(
    `Authenticated user connected: ${socket.id} - ${socket.user?.email}`.green
  );
  if (socket.user?.role === "driver") {
    const { lat, lng } = socket.location;
    redisService.setDriverLocation(socket.user._id, lat, lng).catch((err) => {
      console.error(
        `Error setting driver location for ${socket.user.email}: ${err.message}`
          .red
      );
    });
  }
  if (socket.user?.role === "driver") {
    socket.join(`driver_${socket.user._id}`);
  }
};

export const onDisconnect = (socket) => {
  console.log(`User disconnected: ${socket.id} - ${socket.user?.email}`.red);
  if (socket.user?.role === "driver") {
    redisService.removeDriverLocation(socket.user._id).catch((err) => {
      console.error(
        `Error removing driver location for ${socket.user.email}: ${err.message}`
          .red
      );
    });
  }

  if (socket.user?.role === "driver") {
    socket.leave(`driver_${socket.user._id}`);
  }
};

export const updateDriverLocation = async (socket, data) => {
  const { lat, lng, bookingID } = data;
  if (socket.user?.role !== "driver") {
    socket.emit("error", { message: "Only drivers can update location" });
    return;
  }

  if (bookingID) {
    socket
      .to(`booking:${bookingID}`)
      .emit("driver_location_update", { lat, lng });
  }

  redisService.setDriverLocation(socket.user._id, lat, lng).catch((err) => {
    console.error(
      `Error updating driver location for ${socket.user.email}: ${err.message}`
        .red
    );
  });
};
