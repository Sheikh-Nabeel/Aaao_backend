/**
 * Middleware to validate userId parameter in routes
 * Prevents common issues with invalid ObjectId formats and literal parameter strings
 */

export const validateUserId = (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Check if userId exists
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
        error: "Missing userId parameter"
      });
    }
    
    // Check if userId is the literal parameter string (common API testing mistake)
    if (userId === ':userId' || userId.includes(':')) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID provided. Please provide a valid user ID instead of ':userId'",
        error: "Invalid userId parameter - literal parameter string detected"
      });
    }
    
    // Validate MongoDB ObjectId format (24 character hex string)
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format. User ID must be a valid MongoDB ObjectId (24 character hex string)",
        error: "Invalid ObjectId format",
        providedUserId: userId,
        expectedFormat: "24 character hexadecimal string (e.g., 507f1f77bcf86cd799439011)"
      });
    }
    
    // If all validations pass, continue to the next middleware/controller
    next();
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error validating user ID",
      error: error.message
    });
  }
};

/**
 * Middleware to validate multiple user IDs in request body or query parameters
 * Useful for endpoints that accept multiple user IDs
 */
export const validateMultipleUserIds = (userIdFields = ['userIds']) => {
  return (req, res, next) => {
    try {
      const errors = [];
      
      userIdFields.forEach(field => {
        const userIds = req.body[field] || req.query[field];
        
        if (userIds) {
          const idsArray = Array.isArray(userIds) ? userIds : [userIds];
          
          idsArray.forEach((id, index) => {
            if (!id || typeof id !== 'string') {
              errors.push(`${field}[${index}]: Invalid user ID format`);
            } else if (id === ':userId' || id.includes(':')) {
              errors.push(`${field}[${index}]: Literal parameter string detected`);
            } else if (!id.match(/^[0-9a-fA-F]{24}$/)) {
              errors.push(`${field}[${index}]: Invalid ObjectId format`);
            }
          });
        }
      });
      
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID(s) provided",
          errors: errors
        });
      }
      
      next();
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error validating user IDs",
        error: error.message
      });
    }
  };
};

export default validateUserId;