const rateLimit = require("express-rate-limit");

const buildCorsOptions = (allowedOrigins) => ({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
});

const createLimiters = () => {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many authentication attempts. Please try again later.",
    },
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many login attempts. Please try again later.",
    },
  });

  const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many password reset attempts. Please try again later.",
    },
  });

  const mutationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  return {
    authLimiter,
    loginLimiter,
    passwordResetLimiter,
    mutationLimiter,
  };
};

module.exports = {
  buildCorsOptions,
  createLimiters,
};
