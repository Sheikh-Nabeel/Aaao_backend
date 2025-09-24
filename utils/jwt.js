import jwt from 'jsonwebtoken';

// Ensure JWT_SECRET is set in environment variables
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not set in environment variables. Using default secret. This is not recommended for production!');
}

const JWT_SECRET = process.env.JWT_SECRET || 'your_secure_default_secret_123!';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '30d';

/**
 * Generate a JWT token with the given payload
 * @param {Object} payload - The payload to include in the token
 * @param {string} [secret=JWT_SECRET] - Optional custom secret
 * @param {string|number} [expiresIn=JWT_EXPIRY] - Optional expiration time
 * @returns {string} The generated JWT token
 */
export const generateToken = (payload, secret = JWT_SECRET, expiresIn = JWT_EXPIRY) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }
  
  if (!payload.id) {
    throw new Error('Payload must contain an id field');
  }
  
  return jwt.sign(payload, secret, { 
    expiresIn,
    algorithm: 'HS256' // Explicitly specify the algorithm
  });
};

/**
 * Verify a JWT token
 * @param {string} token - The JWT token to verify
 * @param {string} [secret=JWT_SECRET] - Optional custom secret
 * @returns {{valid: boolean, decoded: Object|null, error: string|null, name: string}}
 */
export const verifyToken = (token, secret = JWT_SECRET) => {
  if (!token) {
    return { 
      valid: false, 
      error: 'No token provided',
      name: 'NoTokenError',
      decoded: null
    };
  }

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return { 
      valid: true, 
      decoded,
      error: null,
      name: 'TokenValid'
    };
  } catch (error) {
    // Log the specific error for debugging
    console.error('JWT Verification Error:', {
      name: error.name,
      message: error.message,
      token: token.substring(0, 10) + '...' + token.substring(token.length - 10) // Log partial token for debugging
    });
    
    return { 
      valid: false, 
      error: error.message,
      name: error.name || 'JWTError',
      decoded: null
    };
  }
};

/**
 * Get token from request object (header, query, or cookies)
 * @param {Object} req - Express request object
 * @returns {string|null} The token if found, null otherwise
 */
export const getTokenFromRequest = (req) => {
  // Try to get token from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  
  // Try to get token from query parameters
  if (req.query && req.query.token) {
    return req.query.token;
  }
  
  // Try to get token from cookies
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  
  return null;
};

// Export the default secret for convenience
export const defaultSecret = JWT_SECRET;
