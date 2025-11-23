import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Booking from "../models/bookingModel.js";
import User from "../models/userModel.js";

const buildDateFilter = (query, field = "createdAt") => {
  let filter = {};
  const { from, to, day } = query;

  if (day === "today") {
    const today = new Date();
    filter[field] = {
      $gte: new Date(today.setHours(0, 0, 0, 0)),
      $lte: new Date(today.setHours(23, 59, 59, 999)),
    };
  } else if (day === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    filter[field] = {
      $gte: new Date(yesterday.setHours(0, 0, 0, 0)),
      $lte: new Date(yesterday.setHours(23, 59, 59, 999)),
    };
  } else if (day === "last7days") {
    filter[field] = {
      $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      $lte: new Date(),
    };
  } else if (day === "last30days") {
    filter[field] = {
      $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      $lte: new Date(),
    };
  } else if (from || to) {
    filter[field] = {};
    if (from) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      filter[field].$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      filter[field].$lte = toDate;
    }
  } else {
    // Default to last 30 days if no date range specified
    filter[field] = {
      $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      $lte: new Date(),
    };
  }

  return filter;
};

const generateReport = async (
  model,
  match = {},
  group = null,
  project = null,
  sort = {}
) => {
  const pipeline = [];

  // Add match stage if provided
  if (Object.keys(match).length > 0) {
    pipeline.push({ $match: match });
  }

  // Add group stage if provided
  if (group) {
    pipeline.push({ $group: group });
  }

  // Add project stage if provided
  if (project) {
    pipeline.push({ $project: project });
  }

  // Add sort stage if provided
  if (Object.keys(sort).length > 0) {
    pipeline.push({ $sort: sort });
  }

  return model.aggregate(pipeline);
};

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

export const getDriverReports = asyncHandler(async (req, res) => {
  try {
    const { status, kyc, city, vehicleType, from, to, day } = req.query;

    // Build base query
    const query = { role: "driver" };

    // Apply filters
    if (status) {
      query.driverStatus = status;
    }

    if (kyc) {
      if (kyc === "approved") {
        query.kycStatus = "approved";
      } else if (kyc === "pending") {
        query.kycStatus = "pending";
      } else if (kyc === "rejected") {
        query.kycStatus = "rejected";
      } else if (kyc === "unverified") {
        query.$or = [
          { kycStatus: { $exists: false } },
          { kycStatus: { $in: [null, ""] } },
        ];
      }
    }

    if (city) {
      query["address.city"] = city;
    }

    if (vehicleType) {
      query.vehicleType = vehicleType;
    }

    // Apply date filter
    if (from || to || day) {
      const dateFilter = buildDateFilter({ from, to, day });
      query.createdAt = dateFilter.createdAt;
    }

    // Get counts in parallel
    const [
      total,
      online,
      offline,
      inRide,
      available,
      kycApproved,
      kycPending,
      kycRejected,
    ] = await Promise.all([
      User.countDocuments(query),
      User.countDocuments({ ...query, driverStatus: "online" }),
      User.countDocuments({ ...query, driverStatus: "offline" }),
      User.countDocuments({ ...query, driverStatus: "in_ride" }),
      User.countDocuments({ ...query, driverStatus: "available" }),
      User.countDocuments({ ...query, kycStatus: "approved" }),
      User.countDocuments({ ...query, kycStatus: "pending" }),
      User.countDocuments({ ...query, kycStatus: "rejected" }),
    ]);

    // Get driver distribution by status
    const statusDistribution = await generateReport(
      User,
      query,
      { _id: "$driverStatus", count: { $sum: 1 } },
      { _id: 0, status: "$_id", count: 1 }
    );

    // Get driver distribution by vehicle type
    const vehicleDistribution = await generateReport(
      User,
      { ...query, vehicleType: { $exists: true, $ne: null } },
      { _id: "$vehicleType", count: { $sum: 1 } },
      { _id: 0, vehicleType: "$_id", count: 1 }
    );

    // Get signup trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const signupTrend = await generateReport(
      User,
      {
        ...query,
        createdAt: { $gte: thirtyDaysAgo },
      },
      {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
      { _id: 0, date: "$_id", count: 1 },
      { date: 1 }
    );

    // Get distinct values for filters
    const [cities, vehicleTypes] = await Promise.all([
      User.distinct("address.city", query),
      User.distinct("vehicleType", query),
    ]);

    res.status(200).json({
      success: true,
      message: "Driver reports fetched successfully",
      data: {
        params: {
          filters: req.query,
          availableFilters: {
            cities: cities.filter(Boolean),
            vehicleTypes: vehicleTypes.filter(Boolean),
          },
        },
        summary: {
          totalDrivers: total,
          onlineDrivers: online,
          offlineDrivers: offline,
          inRideDrivers: inRide,
          availableDrivers: available,
          kycStatus: {
            approved: kycApproved,
            pending: kycPending,
            rejected: kycRejected,
            unverified: total - (kycApproved + kycPending + kycRejected),
          },
        },
        distributions: {
          byStatus: statusDistribution,
          byVehicleType: vehicleDistribution,
        },
        signupTrend,
      },
    });
  } catch (error) {
    console.error("Error in getDriverReports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch driver reports",
      error: error.message,
    });
  }
});

// Get ride and service reports with dynamic filtering
export const getRideServiceReports = asyncHandler(async (req, res) => {
  try {
    const {
      status,
      serviceType,
      city,
      paymentMethod,
      minAmount,
      maxAmount,
      from,
      to,
      day,
    } = req.query;

    // Build base query
    const query = buildDateFilter({ from, to, day });

    // Apply additional filters
    if (status) {
      query.status = status;
    }

    if (serviceType) {
      query.serviceType = serviceType;
    }

    if (city) {
      query["pickupAddress.city"] = city;
    }

    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    if (minAmount || maxAmount) {
      query.totalFare = {};
      if (minAmount) {
        query.totalFare.$gte = parseFloat(minAmount);
      }
      if (maxAmount) {
        query.totalFare.$lte = parseFloat(maxAmount);
      }
    }

    // Get total counts
    const [total, completed, cancelled, inProgress] = await Promise.all([
      Booking.countDocuments(query),
      Booking.countDocuments({ ...query, status: "completed" }),
      Booking.countDocuments({ ...query, status: "cancelled" }),
      Booking.countDocuments({
        ...query,
        status: { $in: ["accepted", "started", "in_progress"] },
      }),
    ]);

    // Get revenue metrics
    const revenueMetrics = await generateReport(
      Booking,
      { ...query, status: "completed" },
      {
        _id: null,
        totalRevenue: { $sum: "$totalFare" },
        avgFare: { $avg: "$totalFare" },
        minFare: { $min: "$totalFare" },
        maxFare: { $max: "$totalFare" },
      }
    );

    // Get service type breakdown
    const serviceBreakdown = await generateReport(
      Booking,
      query,
      {
        _id: "$serviceType",
        count: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        cancelled: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
        },
        revenue: { $sum: "$totalFare" },
        avgFare: { $avg: "$totalFare" },
      },
      {
        _id: 0,
        serviceType: "$_id",
        total: "$count",
        completed: 1,
        cancelled: 1,
        revenue: 1,
        avgFare: 1,
        completionRate: {
          $cond: [
            { $gt: ["$count", 0] },
            { $divide: ["$completed", "$count"] },
            0,
          ],
        },
      },
      { total: -1 }
    );

    // Get hourly distribution
    const hourlyDistribution = await generateReport(
      Booking,
      query,
      { _id: { $hour: "$createdAt" }, count: { $sum: 1 } },
      { _id: 0, hour: "$_id", count: 1 },
      { hour: 1 }
    );

    // Get distinct values for filters
    const [cities, serviceTypes, paymentMethods] = await Promise.all([
      Booking.distinct("pickupAddress.city", query),
      Booking.distinct("serviceType", query),
      Booking.distinct("paymentMethod", query),
    ]);

    res.status(200).json({
      success: true,
      message: "Ride & Service reports fetched successfully",
      data: {
        params: {
          dateRange: query.createdAt || {},
          filters: req.query,
          availableFilters: {
            cities: cities.filter(Boolean),
            serviceTypes: serviceTypes.filter(Boolean),
            paymentMethods: paymentMethods.filter(Boolean),
          },
        },
        summary: {
          totalBookings: total,
          completedRides: completed,
          cancelledRides: cancelled,
          inProgressRides: inProgress,
          completionRate: total > 0 ? (completed / total) * 100 : 0,
          cancellationRate: total > 0 ? (cancelled / total) * 100 : 0,
          ...(revenueMetrics[0] || {}),
        },
        serviceBreakdown,
        hourlyDistribution,
      },
    });
  } catch (error) {
    console.error("Error in getRideServiceReports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ride service reports",
      error: error.message,
    });
  }
});

// Get analytics reports with dynamic filtering
export const getAnalyticsReports = asyncHandler(async (req, res) => {
  try {
    const { period = "month", from, to } = req.query;

    // Build date range
    let dateFilter = {};
    if (from || to) {
      if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        dateFilter.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.$lte = toDate;
      }
    } else {
      // Default to last 30 days
      const defaultFrom = new Date();
      defaultFrom.setDate(defaultFrom.getDate() - 30);
      defaultFrom.setHours(0, 0, 0, 0);

      dateFilter = {
        $gte: defaultFrom,
        $lte: new Date(),
      };
    }

    // User analytics
    const userAnalytics = await generateReport(
      User,
      {
        role: { $in: ["user", "driver"] },
        createdAt: dateFilter,
      },
      {
        _id: {
          role: "$role",
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        },
        count: { $sum: 1 },
      },
      {
        _id: 0,
        role: "$_id.role",
        date: "$_id.date",
        count: 1,
      },
      { role: 1, date: 1 }
    );

    // Booking analytics
    const bookingAnalytics = await generateReport(
      Booking,
      {
        status: "completed",
        createdAt: dateFilter,
      },
      {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        },
        count: { $sum: 1 },
        revenue: { $sum: "$totalFare" },
      },
      {
        _id: 0,
        date: "$_id.date",
        count: 1,
        revenue: 1,
      },
      { date: 1 }
    );

    // Payment method distribution
    const paymentDistribution = await generateReport(
      Booking,
      {
        status: "completed",
        createdAt: dateFilter,
      },
      {
        _id: "$paymentMethod",
        count: { $sum: 1 },
        amount: { $sum: "$totalFare" },
      },
      {
        _id: 0,
        paymentMethod: "$_id",
        count: 1,
        amount: 1,
      }
    );

    res.status(200).json({
      success: true,
      message: "Analytics reports fetched successfully",
      data: {
        dateRange: dateFilter,
        userAnalytics,
        bookingAnalytics,
        paymentDistribution,
      },
    });
  } catch (error) {
    console.error("Error in getAnalyticsReports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics reports",
      error: error.message,
    });
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

