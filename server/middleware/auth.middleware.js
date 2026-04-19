const jwt = require("jsonwebtoken");

const verifyAuthHeader = (token, jwtSecret, res) => {
  if (!token) {
    res.status(401).json({ message: "Access denied" });
    return null;
  }

  try {
    return jwt.verify(token, jwtSecret);
  } catch (err) {
    res.status(403).json({ message: "Invalid token" });
    return null;
  }
};

module.exports = {
  verifyAuthHeader,
};
