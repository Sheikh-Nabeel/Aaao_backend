import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Booking from "../models/bookingModel.js";
import User from "../models/userModel.js";

export const getAdminOverview = asyncHandler(async (req, res) => {
  try {
    const [totalBookings, totalCustomers, totalDrivers, bookingsWithChats] =
      await Promise.all([
        Booking.countDocuments({}),
        User.countDocuments({ role: "customer" }),
        User.countDocuments({ role: "driver" }),
        Booking.countDocuments({ "messages.0": { $exists: true } }),
      ]);

    res.status(200).json({
      success: true,
      message: "Admin overview fetched successfully",
      data: {
        totals: {
          bookings: totalBookings,
          customers: totalCustomers,
          drivers: totalDrivers,
          bookingsWithChats,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export const getBookingChats = asyncHandler(async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Valid bookingId is required",
      });
    }

    const booking = await Booking.findById(bookingId)
      .select("_id user driver messages")
      .populate({
        path: "messages.sender",
        select: "firstName lastName username phoneNumber role selfieImage",
        model: "User",
      })
      .lean();

    if (!booking) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    }

    const messages = (booking.messages || []).map((m) => ({
      id: String(m._id || ""),
      sender:
        m.sender && typeof m.sender === "object"
          ? {
              id: String(m.sender._id || m.sender || ""),
              name:
                `${m.sender.firstName ?? ""} ${
                  m.sender.lastName ?? ""
                }`.trim() ||
                m.sender.username ||
                undefined,
              role: m.sender.role,
              phoneNumber: m.sender.phoneNumber,
              avatar: m.sender.selfieImage || null,
            }
          : {
              id: String(m.sender || ""),
              role: m.senderRole || undefined,
            },
      senderRole: m.senderRole,
      message: m.message,
      messageType: m.messageType,
      timestamp: m.timestamp,
      readBy: m.readBy || [],
    }));

    res.status(200).json({
      success: true,
      message: "Booking chats fetched successfully",
      data: {
        bookingId: booking._id,
        userId: booking.user,
        driverId: booking.driver,
        messages,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export const getAdminDashboard = asyncHandler(async (req, res) => {
  try {
    const { bookingId } = req.query || {};
    const type = String(req.query?.type || "").toLowerCase();
    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query?.limit, 10) || 10)
    );
    const skip = (page - 1) * limit;

    const [totalBookings, totalCustomers, totalDrivers, bookingsWithChats] =
      await Promise.all([
        Booking.countDocuments({}),
        User.countDocuments({ role: "customer" }),
        User.countDocuments({ role: "driver" }),
        Booking.countDocuments({ "messages.0": { $exists: true } }),
      ]);

    // Build list according to type
    let list = [];
    let listCount = 0;
    let listType = null;

    if (type === "bookings") {
      listType = "bookings";
      listCount = totalBookings;
      // FULL booking documents
      list = await Booking.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    } else if (type === "customers") {
      listType = "customers";
      listCount = totalCustomers;
      // FULL customer docs filtered by role
      list = await User.find({ role: "customer" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    } else if (type === "drivers") {
      listType = "drivers";
      listCount = totalDrivers;
      // FULL driver docs filtered by role
      list = await User.find({ role: "driver" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    }

    // Optional chats
    let chats = null;
    if (bookingId) {
      if (!mongoose.Types.ObjectId.isValid(String(bookingId))) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid bookingId" });
      }
      const booking = await Booking.findById(bookingId)
        .select("_id user driver messages")
        .populate({
          path: "messages.sender",
          select: "firstName lastName username phoneNumber role selfieImage",
          model: "User",
        })
        .lean();
      if (!booking) {
        return res
          .status(404)
          .json({ success: false, message: "Booking not found" });
      }
      chats = {
        bookingId: booking._id,
        userId: booking.user,
        driverId: booking.driver,
        messages: (booking.messages || []).map((m) => ({
          id: String(m._id || ""),
          sender:
            m.sender && typeof m.sender === "object"
              ? {
                  id: String(m.sender._id || m.sender || ""),
                  name:
                    `${m.sender.firstName ?? ""} ${
                      m.sender.lastName ?? ""
                    }`.trim() ||
                    m.sender.username ||
                    undefined,
                  role: m.sender.role,
                  phoneNumber: m.sender.phoneNumber,
                  avatar: m.sender.selfieImage || null,
                }
              : {
                  id: String(m.sender || ""),
                  role: m.senderRole || undefined,
                },
          senderRole: m.senderRole,
          message: m.message,
          messageType: m.messageType,
          timestamp: m.timestamp,
          readBy: m.readBy || [],
        })),
      };
    }

    res.status(200).json({
      success: true,
      message: "Admin dashboard fetched successfully",
      data: {
        totals: {
          bookings: totalBookings,
          customers: totalCustomers,
          drivers: totalDrivers,
          bookingsWithChats,
        },
        list: listType
          ? { type: listType, page, limit, total: listCount, items: list }
          : null,
        chats,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
