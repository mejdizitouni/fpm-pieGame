const crypto = require("crypto");

const getEnv = () => {
  const port = process.env.PORT || 3001;
  const jwtSecret =
    process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

  if (!process.env.JWT_SECRET) {
    console.warn(
      "JWT_SECRET is not set. Using an ephemeral key; tokens will reset on server restart."
    );
  }

  const allowedOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port,
    jwtSecret,
    allowedOrigins,
  };
};

module.exports = {
  getEnv,
};
