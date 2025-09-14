const handleBookingAccept = (io, bookingId) => {
  console.log(`Booking ${bookingId} accepted`);
  io.emit("bookingAccepted", { bookingId });
};
