const hasJsonBody = (req, res, next) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ message: "Invalid JSON payload" });
  }

  return next();
};

const requireFields = (fields) => (req, res, next) => {
  const missing = fields.filter((field) => {
    const value = req.body?.[field];
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    return res.status(400).json({
      message: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  return next();
};

const validateNonEmptyString = (field, label = field) => (req, res, next) => {
  const value = req.body?.[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    return res.status(400).json({ message: `${label} is required` });
  }

  return next();
};

const validatePositiveInteger = (field, label = field) => (req, res, next) => {
  const rawValue = req.body?.[field];
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    return res.status(400).json({ message: `${label} must be a positive integer` });
  }

  return next();
};

module.exports = {
  hasJsonBody,
  requireFields,
  validateNonEmptyString,
  validatePositiveInteger,
};
