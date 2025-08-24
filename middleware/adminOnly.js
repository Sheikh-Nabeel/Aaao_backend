import asyncHandler from 'express-async-handler';

// Middleware to check if user is admin
export const adminOnly = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 'Authentication required',
      token: req.cookies.token
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin access required',
      token: req.cookies.token
    });
  }

  next();
});