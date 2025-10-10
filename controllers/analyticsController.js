import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";

// Get user analytics for dashboard
export const getUserAnalytics = asyncHandler(async (req, res) => {
  try {
    const { period = "week", startDate, endDate } = req.query;

    // Validate period parameter
    const validPeriods = ["day", "week", "month", "year"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Must be one of: day, week, month, year"
      });
    }

    // Calculate date range based on period
    const dateRange = calculateDateRange(period, startDate, endDate);
    
    // Get summary statistics
    const summary = await calculateSummaryStats(dateRange);
    
    // Get chart data based on period
    const chartData = await generateChartData(period, dateRange);

    res.status(200).json({
      success: true,
      data: {
        summary,
        chartData,
        period,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      }
    });

  } catch (error) {
    console.error("Error getting user analytics:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Calculate date range based on period
const calculateDateRange = (period, startDate, endDate) => {
  const now = new Date();
  let start, end;

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else {
    switch (period) {
      case "day":
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      
      case "week":
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6); // End of week (Saturday)
        end.setHours(23, 59, 59, 999);
        break;
      
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
      
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        end.setHours(23, 59, 59, 999);
        break;
      
      default:
        start = new Date(now);
        start.setDate(now.getDate() - 7);
        end = new Date(now);
    }
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
};

// Calculate summary statistics
const calculateSummaryStats = async (dateRange) => {
  try {
    const { startDate, endDate } = dateRange;
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const [
      totalUsers,
      activeUsers,
      verifiedKYC,
      unverifiedKYC,
      pendingKYC,
      rejectedKYC
    ] = await Promise.all([
      // Total users
      User.countDocuments({
        createdAt: { $gte: start, $lte: end }
      }),
      
      // Active users (verified and active)
      User.countDocuments({ 
        isActive: true, 
        isVerified: true,
        createdAt: { $gte: start, $lte: end }
      }),
      
      // Verified KYC
      User.countDocuments({ 
        kycStatus: 'approved',
        createdAt: { $gte: start, $lte: end }
      }),
      
      // Unverified KYC (null, pending, or rejected)
      User.countDocuments({ 
        kycStatus: { $in: [null, 'pending', 'rejected'] },
        createdAt: { $gte: start, $lte: end }
      }),
      
      // Pending KYC
      User.countDocuments({ 
        kycStatus: 'pending',
        createdAt: { $gte: start, $lte: end }
      }),
      
      // Rejected KYC
      User.countDocuments({ 
        kycStatus: 'rejected',
        createdAt: { $gte: start, $lte: end }
      })
    ]);

    return {
      totalUsers,
      activeUsers,
      verifiedKYC,
      unverifiedKYC,
      pendingKYC,
      rejectedKYC
    };
  } catch (error) {
    console.error("Error calculating summary stats:", error);
    throw error;
  }
};

// Generate chart data based on period
const generateChartData = async (period, dateRange) => {
  try {
    const { startDate, endDate } = dateRange;
    const start = new Date(startDate);
    const end = new Date(endDate);

    let labels, signupsData, verificationsData, conversionsData;

    switch (period) {
      case "day":
        labels = ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"];
        signupsData = await getSignupsByDay(start, end);
        verificationsData = await getKYCVerificationsByDay(start, end);
        conversionsData = await getActiveConversionsByDay(start, end);
        break;
      
      case "week":
        labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        signupsData = await getSignupsByWeek(start, end);
        verificationsData = await getKYCVerificationsByWeek(start, end);
        conversionsData = await getActiveConversionsByWeek(start, end);
        break;
      
      case "month":
        labels = ["Week 1", "Week 2", "Week 3", "Week 4"];
        signupsData = await getSignupsByMonth(start, end);
        verificationsData = await getKYCVerificationsByMonth(start, end);
        conversionsData = await getActiveConversionsByMonth(start, end);
        break;
      
      case "year":
        labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        signupsData = await getSignupsByYear(start, end);
        verificationsData = await getKYCVerificationsByYear(start, end);
        conversionsData = await getActiveConversionsByYear(start, end);
        break;
      
      default:
        labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        signupsData = await getSignupsByWeek(start, end);
        verificationsData = await getKYCVerificationsByWeek(start, end);
        conversionsData = await getActiveConversionsByWeek(start, end);
    }

    return {
      labels,
      datasets: [
        {
          label: "Total Signups",
          data: signupsData,
          color: "#FFD700"
        },
        {
          label: "KYC Verifications",
          data: verificationsData,
          color: "#00FF00"
        },
        {
          label: "Active Conversions",
          data: conversionsData,
          color: "#0000FF"
        }
      ]
    };
  } catch (error) {
    console.error("Error generating chart data:", error);
    throw error;
  }
};

// Get signups by day (3-hour intervals)
const getSignupsByDay = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          $switch: {
            branches: [
              { case: { $lt: [{ $hour: "$createdAt" }, 3] }, then: 0 },
              { case: { $lt: [{ $hour: "$createdAt" }, 6] }, then: 1 },
              { case: { $lt: [{ $hour: "$createdAt" }, 9] }, then: 2 },
              { case: { $lt: [{ $hour: "$createdAt" }, 12] }, then: 3 },
              { case: { $lt: [{ $hour: "$createdAt" }, 15] }, then: 4 },
              { case: { $lt: [{ $hour: "$createdAt" }, 18] }, then: 5 },
              { case: { $lt: [{ $hour: "$createdAt" }, 21] }, then: 6 },
              { case: { $gte: [{ $hour: "$createdAt" }, 21] }, then: 7 }
            ],
            default: 0
          }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Fill in missing intervals with 0
  const data = new Array(8).fill(0);
  result.forEach(item => {
    data[item._id] = item.count;
  });

  return data;
};

// Get signups by week (day of week)
const getSignupsByWeek = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: { $dayOfWeek: "$createdAt" },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Fill in missing days with 0 (MongoDB dayOfWeek: 1=Sunday, 2=Monday, etc.)
  const data = new Array(7).fill(0);
  result.forEach(item => {
    data[item._id - 1] = item.count; // Convert to 0-based index
  });

  return data;
};

// Get signups by month (weeks)
const getSignupsByMonth = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          $ceil: { $divide: [{ $dayOfMonth: "$createdAt" }, 7] }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Fill in missing weeks with 0
  const data = new Array(4).fill(0);
  result.forEach(item => {
    const weekIndex = Math.min(item._id - 1, 3); // Cap at week 4
    data[weekIndex] = item.count;
  });

  return data;
};

// Get signups by year (months)
const getSignupsByYear = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: { $month: "$createdAt" },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Fill in missing months with 0
  const data = new Array(12).fill(0);
  result.forEach(item => {
    data[item._id - 1] = item.count; // Convert to 0-based index
  });

  return data;
};

// Get KYC verifications by day
const getKYCVerificationsByDay = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        kycStatus: 'approved',
        updatedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          $switch: {
            branches: [
              { case: { $lt: [{ $hour: "$updatedAt" }, 3] }, then: 0 },
              { case: { $lt: [{ $hour: "$updatedAt" }, 6] }, then: 1 },
              { case: { $lt: [{ $hour: "$updatedAt" }, 9] }, then: 2 },
              { case: { $lt: [{ $hour: "$updatedAt" }, 12] }, then: 3 },
              { case: { $lt: [{ $hour: "$updatedAt" }, 15] }, then: 4 },
              { case: { $lt: [{ $hour: "$updatedAt" }, 18] }, then: 5 },
              { case: { $lt: [{ $hour: "$updatedAt" }, 21] }, then: 6 },
              { case: { $gte: [{ $hour: "$updatedAt" }, 21] }, then: 7 }
            ],
            default: 0
          }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const data = new Array(8).fill(0);
  result.forEach(item => {
    data[item._id] = item.count;
  });

  return data;
};

// Get KYC verifications by week
const getKYCVerificationsByWeek = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        kycStatus: 'approved',
        updatedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: { $dayOfWeek: "$updatedAt" },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const data = new Array(7).fill(0);
  result.forEach(item => {
    data[item._id - 1] = item.count;
  });

  return data;
};

// Get KYC verifications by month
const getKYCVerificationsByMonth = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        kycStatus: 'approved',
        updatedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          $ceil: { $divide: [{ $dayOfMonth: "$updatedAt" }, 7] }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const data = new Array(4).fill(0);
  result.forEach(item => {
    const weekIndex = Math.min(item._id - 1, 3);
    data[weekIndex] = item.count;
  });

  return data;
};

// Get KYC verifications by year
const getKYCVerificationsByYear = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        kycStatus: 'approved',
        updatedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: { $month: "$updatedAt" },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const data = new Array(12).fill(0);
  result.forEach(item => {
    data[item._id - 1] = item.count;
  });

  return data;
};

// Get active conversions by day
const getActiveConversionsByDay = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        isActive: true,
        isVerified: true,
        lastActiveAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          $switch: {
            branches: [
              { case: { $lt: [{ $hour: "$lastActiveAt" }, 3] }, then: 0 },
              { case: { $lt: [{ $hour: "$lastActiveAt" }, 6] }, then: 1 },
              { case: { $lt: [{ $hour: "$lastActiveAt" }, 9] }, then: 2 },
              { case: { $lt: [{ $hour: "$lastActiveAt" }, 12] }, then: 3 },
              { case: { $lt: [{ $hour: "$lastActiveAt" }, 15] }, then: 4 },
              { case: { $lt: [{ $hour: "$lastActiveAt" }, 18] }, then: 5 },
              { case: { $lt: [{ $hour: "$lastActiveAt" }, 21] }, then: 6 },
              { case: { $gte: [{ $hour: "$lastActiveAt" }, 21] }, then: 7 }
            ],
            default: 0
          }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const data = new Array(8).fill(0);
  result.forEach(item => {
    data[item._id] = item.count;
  });

  return data;
};

// Get active conversions by week
const getActiveConversionsByWeek = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        isActive: true,
        isVerified: true,
        lastActiveAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: { $dayOfWeek: "$lastActiveAt" },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const data = new Array(7).fill(0);
  result.forEach(item => {
    data[item._id - 1] = item.count;
  });

  return data;
};

// Get active conversions by month
const getActiveConversionsByMonth = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        isActive: true,
        isVerified: true,
        lastActiveAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          $ceil: { $divide: [{ $dayOfMonth: "$lastActiveAt" }, 7] }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const data = new Array(4).fill(0);
  result.forEach(item => {
    const weekIndex = Math.min(item._id - 1, 3);
    data[weekIndex] = item.count;
  });

  return data;
};

// Get active conversions by year
const getActiveConversionsByYear = async (startDate, endDate) => {
  const result = await User.aggregate([
    {
      $match: {
        isActive: true,
        isVerified: true,
        lastActiveAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: { $month: "$lastActiveAt" },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const data = new Array(12).fill(0);
  result.forEach(item => {
    data[item._id - 1] = item.count;
  });

  return data;
};
