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

// Driver Reports: total drivers, online drivers, unverified KYC
export const getDriverReports = asyncHandler(async (req, res) => {
  try {
    const [total, online, unverifiedKyc] = await Promise.all([
      User.countDocuments({ role: "driver" }),
      User.countDocuments({ role: "driver", driverStatus: "online" }),
      User.countDocuments({ role: "driver", kycStatus: { $ne: "approved" } }),
    ]);

    res.status(200).json({
      success: true,
      message: "Driver reports fetched successfully",
      data: {
        totals: {
          totalDrivers: total,
          onlineDrivers: online,
          unverifiedKyc,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Ride & Service Reports with date filtering: totals, completed, cancelled, top service, peak hour, service-wise success rate
export const getRideServiceReports = asyncHandler(async (req, res) => {
  try {
    // Parse date range (default: last 30 days)
    const fromDate = req.query.from 
      ? new Date(req.query.from) 
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fromDate.setHours(0, 0, 0, 0);
    
    const toDate = req.query.to 
      ? new Date(req.query.to)
      : new Date();
    toDate.setHours(23, 59, 59, 999);
    
    // Parse day filter (today/last 7 days/last 30 days)
    let dateFilter = { $gte: fromDate, $lte: toDate };
    const dayParam = req.query.day;
    
    if (dayParam === 'today') {
      const today = new Date();
      dateFilter = { 
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lte: new Date(today.setHours(23, 59, 59, 999))
      };
    } else if (dayParam === 'last7days') {
      dateFilter = { 
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        $lte: new Date()
      };
    } else if (dayParam === 'last30days') {
      dateFilter = { 
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: new Date()
      };
    }
    
    // Base match for all queries
    const baseMatch = { createdAt: dateFilter };
    
    const [total, completed, cancelled] = await Promise.all([
      Booking.countDocuments(baseMatch),
      Booking.countDocuments({ ...baseMatch, status: "completed" }),
      Booking.countDocuments({ ...baseMatch, status: "cancelled" }),
    ]);

    // Peak usage time by hour of day
    const peakHourAgg = await Booking.aggregate([
      { $match: baseMatch },
      { $group: { _id: { $hour: "$createdAt" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]);
    
    const peakUsageTime = peakHourAgg[0]
      ? { hour: peakHourAgg[0]._id, count: peakHourAgg[0].count }
      : null;

    // Service-wise breakdown (counts, completed/cancelled, successRate)
    const servicesAgg = await Booking.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: "$serviceType",
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          serviceType: "$_id",
          total: 1,
          completed: 1,
          cancelled: 1,
          successRate: {
            $cond: [
              { $gt: ["$total", 0] },
              { $divide: ["$completed", "$total"] },
              0,
            ],
          },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const serviceTypeBreakdown = servicesAgg.map((s) => ({
      ...s,
      percentage: total > 0 ? s.total / total : 0,
    }));
    
    const topServiceType = serviceTypeBreakdown[0] || null;
    
    // Get distinct cities and service types for filters
    const [cities, serviceTypes] = await Promise.all([
      Booking.distinct("pickupAddress.city", baseMatch),
      Booking.distinct("serviceType", baseMatch)
    ]);

    res.status(200).json({
      success: true,
      message: "Ride & Service reports fetched successfully",
      data: {
        params: {
          dateRange: { 
            from: dateFilter.$gte, 
            to: dateFilter.$lte 
          },
          filters: {
            day: dayParam,
            from: req.query.from,
            to: req.query.to
          },
          availableFilters: {
            cities: cities.filter(Boolean),
            serviceTypes: serviceTypes.filter(Boolean)
          }
        },
        totals: {
          totalBookings: total,
          completedRides: completed,
          cancelledRides: cancelled,
          completionRate: total > 0 ? (completed / total) * 100 : 0,
          cancellationRate: total > 0 ? (cancelled / total) * 100 : 0
        },
        peakUsageTime,
        topServiceType,
        serviceTypeBreakdown,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Customer Reports: total, active, inactive, blocked, verified/unverified KYC with date range
export const getAnalyticsReports = asyncHandler(async (req, res) => {
  try {
    // Parse date range (default: last 30 days)
    const fromDate = req.query.from 
      ? new Date(req.query.from) 
      : new Date();
    fromDate.setHours(0, 0, 0, 0);
    
    const toDate = req.query.to 
      ? new Date(req.query.to)
      : new Date();
    toDate.setHours(23, 59, 59, 999);
    
    // Status filter (all/active/inactive/blocked)
    const status = req.query.status || 'all';
    
    // Base query for customers
    const baseQuery = { role: "customer" };
    
    // Add status filter if specified
    let statusQuery = {};
    if (status === 'active') {
      // Active customers have bookings in the date range
      const activeUserIds = await Booking.distinct("user", { 
        createdAt: { $gte: fromDate, $lte: toDate } 
      });
      statusQuery._id = { $in: activeUserIds };
    } else if (status === 'inactive') {
      // Inactive customers have no bookings in the date range
      const activeUserIds = await Booking.distinct("user", { 
        createdAt: { $gte: fromDate, $lte: toDate } 
      });
      statusQuery._id = { $nin: activeUserIds };
    } else if (status === 'blocked') {
      // Blocked customers (assuming there's an isBlocked field)
      statusQuery.isBlocked = true;
    }
    
    // Combine base and status queries
    const userQuery = { ...baseQuery, ...statusQuery };
    
    // Get counts in parallel
    const [
      totalCustomers, 
      activeUserIds, 
      verifiedKyc,
      blockedCount
    ] = await Promise.all([
      // Total customers matching the filter
      User.countDocuments(userQuery),
      
      // Active customers (have bookings in date range)
      Booking.distinct("user", { 
        createdAt: { $gte: fromDate, $lte: toDate } 
      }),
      
      // Verified KYC customers
      User.countDocuments({ 
        ...userQuery, 
        kycStatus: "approved" 
      }),
      
      // Blocked customers count (if not already filtered by status)
      status === 'blocked' ? 0 : User.countDocuments({ 
        ...baseQuery, 
        isBlocked: true 
      })
    ]);
    
    // Calculate active/inactive counts
    const activeCustomers = Array.isArray(activeUserIds) ? activeUserIds.length : 0;
    const inactiveCustomers = Math.max(0, totalCustomers - activeCustomers);
    
    // Get city distribution (for dropdown)
    const cities = await User.distinct("city", { role: "customer" });
    
    // Get service types (for dropdown)
    const serviceTypes = await Booking.distinct("serviceType");

    res.status(200).json({
      success: true,
      message: "Customer analytics fetched successfully",
      data: {
        params: { 
          dateRange: { from: fromDate, to: toDate },
          status,
          availableFilters: {
            cities: cities.filter(Boolean), // Remove any null/undefined
            serviceTypes: serviceTypes.filter(Boolean)
          }
        },
        totals: {
          totalCustomers,
          activeCustomers,
          inactiveCustomers,
          blockedCustomers: status === 'blocked' ? totalCustomers : blockedCount,
          verifiedKyc,
          unverifiedKyc: Math.max(0, totalCustomers - verifiedKyc)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export const addChatKeywords = asyncHandler(async (req, res) => {
  const adminId = req.user?._id;
  const words = Array.isArray(req.body?.words) ? req.body.words : [];
  if (!adminId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  if (words.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "words array is required" });
  }

  const normalized = words
    .map((w) =>
      String(w || "")
        .trim()
        .toLowerCase()
    )
    .filter((w) => w.length > 0);

  const admin = await User.findByIdAndUpdate(
    adminId,
    { $addToSet: { "adminSettings.chatKeywords": { $each: normalized } } },
    { new: true, select: "adminSettings.chatKeywords" }
  ).lean();

  res.status(200).json({
    success: true,
    message: "Keywords added",
    data: { keywords: admin?.adminSettings?.chatKeywords || [] },
  });
});

export const getChatKeywords = asyncHandler(async (req, res) => {
  const adminId = req.user?._id;
  if (!adminId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  const admin = await User.findById(adminId)
    .select("adminSettings.chatKeywords")
    .lean();
  res.status(200).json({
    success: true,
    message: "Keywords fetched",
    data: { keywords: admin?.adminSettings?.chatKeywords || [] },
  });
});

export const deleteChatKeyword = asyncHandler(async (req, res) => {
  const adminId = req.user?._id;
  const { word } = req.params;
  if (!adminId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  const target = String(word || "")
    .trim()
    .toLowerCase();
  if (!target) {
    return res
      .status(400)
      .json({ success: false, message: "word param is required" });
  }
  const admin = await User.findByIdAndUpdate(
    adminId,
    { $pull: { "adminSettings.chatKeywords": target } },
    { new: true, select: "adminSettings.chatKeywords" }
  ).lean();
  res.status(200).json({
    success: true,
    message: "Keyword removed",
    data: { keywords: admin?.adminSettings?.chatKeywords || [] },
  });
});

export const searchChatsByKeywords = asyncHandler(async (req, res) => {
  const adminId = req.user?._id;
  if (!adminId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
  const limit = Math.max(
    1,
    Math.min(100, parseInt(req.query?.limit, 10) || 10)
  );
  const skip = (page - 1) * limit;

  // Source of keywords: current admin's list unless overridden via ?words=a,b
  const override =
    typeof req.query?.words === "string" ? req.query.words.split(",") : [];
  let keywords = override.length
    ? override
    : (await User.findById(adminId).select("adminSettings.chatKeywords").lean())
        ?.adminSettings?.chatKeywords || [];

  keywords = keywords
    .map((w) => String(w || "").trim())
    .filter((w) => w.length > 0);

  if (keywords.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No keywords set",
      data: { page, limit, total: 0, items: [] },
    });
  }

  // Build regex to match any keyword (case-insensitive)
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "i");

  // Find bookings that have any matching message
  const query = { "messages.message": { $regex: regex } };
  const total = await Booking.countDocuments(query);

  const bookings = await Booking.find(query)
    .select("_id messages")
    .populate({
      path: "messages.sender",
      select: "firstName lastName username phoneNumber role selfieImage",
      model: "User",
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const items = bookings.map((b) => ({
    bookingId: b._id,
    messages: (b.messages || [])
      .filter((m) => typeof m.message === "string" && regex.test(m.message))
      .map((m) => ({
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
            : { id: String(m.sender || ""), role: m.senderRole || undefined },
        senderRole: m.senderRole,
        message: m.message,
        messageType: m.messageType,
        timestamp: m.timestamp,
        readBy: m.readBy || [],
      })),
  }));

  res.status(200).json({
    success: true,
    message: "Chats searched by keywords",
    data: { page, limit, total, items, params: { words: keywords } },
  });
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
      .select("_id messages")
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
    const status = String(req.query?.status || "").toLowerCase();
    const isActiveParam = req.query?.isActive;
    const isActiveFilter =
      typeof isActiveParam === "string"
        ? isActiveParam === "true"
          ? true
          : isActiveParam === "false"
          ? false
          : undefined
        : undefined;
    const hasChatsParam = req.query?.hasChats;
    const hasChats =
      typeof hasChatsParam === "string" ? hasChatsParam === "true" : undefined;

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
      const bookingQuery = {};
      if (hasChats === true) {
        bookingQuery["messages.0"] = { $exists: true };
      }
      if (status) {
        if (status === "ongoing") {
          bookingQuery.status = { $in: ["accepted", "started", "in_progress"] };
        } else {
          bookingQuery.status = status;
        }
      }

      // Counts (overall, not affected by filters)
      const [completed, cancelled, pending, ongoing] = await Promise.all([
        Booking.countDocuments({ status: "completed" }),
        Booking.countDocuments({ status: "cancelled" }),
        Booking.countDocuments({ status: "pending" }),
        Booking.countDocuments({
          status: { $in: ["accepted", "started", "in_progress"] },
        }),
      ]);

      listCount = await Booking.countDocuments(bookingQuery);

      if (hasChats === true) {
        // Minimal shape with chats only
        const bookings = await Booking.find(bookingQuery)
          .select("_id messages")
          .populate({
            path: "messages.sender",
            select: "firstName lastName username phoneNumber role selfieImage",
            model: "User",
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

        list = bookings.map((booking) => ({
          bookingId: booking._id,
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
        }));
      } else {
        // Full booking documents
        list = await Booking.find(bookingQuery)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();
      }

      // attach counts for bookings
      var bookingStatusCounts = {
        total: totalBookings,
        completed,
        cancelled,
        ongoing,
        pending,
      };
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
      const driverQuery = { role: "driver" };
      if (status) {
        driverQuery.driverStatus = status;
      }
      if (typeof isActiveFilter === "boolean") {
        driverQuery.isActive = isActiveFilter;
      }
      listCount = await User.countDocuments(driverQuery);
      list = await User.find(driverQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    }

    // Optional chats
    let chats = null;
    let driverStatusCounts = null;
    if (listType === "drivers") {
      const base = { role: "driver" };
      const [online, offline] = await Promise.all([
        User.countDocuments({ ...base, driverStatus: "online" }),
        User.countDocuments({ ...base, driverStatus: "offline" }),
      ]);
      driverStatusCounts = { online, offline };
    }
    if (bookingId) {
      if (!mongoose.Types.ObjectId.isValid(String(bookingId))) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid bookingId" });
      }
      const booking = await Booking.findById(bookingId)
        .select("_id messages")
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
          ? {
              type: listType,
              page,
              limit,
              total: listCount,
              items: list,
              params:
                listType === "drivers"
                  ? {
                      status: status || null,
                      isActive:
                        typeof isActiveFilter === "boolean"
                          ? isActiveFilter
                          : null,
                    }
                  : listType === "bookings"
                  ? { hasChats: hasChats === true, status: status || null }
                  : null,
              counts:
                listType === "drivers"
                  ? driverStatusCounts
                  : listType === "bookings"
                  ? bookingStatusCounts
                  : null,
            }
          : null,
        chats,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
