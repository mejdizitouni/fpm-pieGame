const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const PASSWORD_RESET_FROM = "mejdi.zitouni@gmail.com";

const normalizeAuthHeader = (headerValue = "") =>
  headerValue.startsWith("Bearer ") ? headerValue.slice(7) : headerValue;

const createMailTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === "true" || Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

const registerAuthRoutes = ({ app, db, authLimiter, jwtSecret }) => {
  app.post("/login", authLimiter, (req, res) => {
    const { username, password } = req.body;

    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
      if (err) {
        return res.status(500).json({ message: "Database error" });
      }
      if (user && Number(user.is_active) !== 1) {
        return res.status(403).json({ message: "User account is deactivated" });
      }
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          email: user.email || null,
          role: user.role || "Enseignant",
          firstName: user.first_name || "",
          lastName: user.last_name || "",
        },
        jwtSecret,
        {
        expiresIn: "1h",
        }
      );
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email || null,
          role: user.role || "Enseignant",
          firstName: user.first_name || "",
          lastName: user.last_name || "",
        },
      });
    });
  });

  app.post("/verify-token", (req, res) => {
    const token = req.body.token;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Token is invalid or expired" });
      }
      res.json({
        valid: true,
        user: {
          userId: decoded.userId,
          username: decoded.username,
          email: decoded.email || null,
          role: decoded.role || "Enseignant",
          firstName: decoded.firstName || "",
          lastName: decoded.lastName || "",
        },
      });
    });
  });

  app.get("/admin-check", (req, res) => {
    const token = normalizeAuthHeader(req.headers["authorization"]);
    if (!token) {
      return res.status(401).json({ message: "Access denied" });
    }

    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      res.json({
        message: `Hello, ${decoded.username}`,
        user: {
          userId: decoded.userId,
          username: decoded.username,
          email: decoded.email || null,
          role: decoded.role || "Enseignant",
          firstName: decoded.firstName || "",
          lastName: decoded.lastName || "",
        },
      });
    });
  });

  app.get("/users", (req, res) => {
    const token = normalizeAuthHeader(req.headers["authorization"]);
    if (!token) {
      return res.status(401).json({ message: "Access denied" });
    }

    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      if (decoded.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      db.all(
        `SELECT id, username, email, role, is_active, first_name, last_name FROM users ORDER BY CASE role WHEN 'Admin' THEN 0 ELSE 1 END, username ASC`,
        (dbErr, users) => {
          if (dbErr) {
            return res.status(500).json({ message: "Database error" });
          }
          res.json(
            (users || []).map((user) => ({
              id: user.id,
              username: user.username,
              email: user.email,
              role: user.role,
              is_active: Number(user.is_active) === 1 ? 1 : 0,
              first_name: user.first_name || "",
              last_name: user.last_name || "",
            }))
          );
        }
      );
    });
  });

  app.post("/users", authLimiter, (req, res) => {
    const token = normalizeAuthHeader(req.headers["authorization"]);
    if (!token) {
      return res.status(401).json({ message: "Access denied" });
    }

    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      if (decoded.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { username, password, email, role, firstName, lastName } = req.body;
      const allowedRoles = new Set(["Admin", "Enseignant"]);

      if (!username || !password || !email || !allowedRoles.has(role) || !firstName || !lastName) {
        return res.status(400).json({ message: "username, password, email, role, firstName and lastName are required" });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      db.run(
        `INSERT INTO users (username, password, email, role, is_active, first_name, last_name) VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [username, hashedPassword, email, role, firstName, lastName],
        function (insertErr) {
          if (insertErr) {
            if (String(insertErr.message || "").includes("UNIQUE")) {
              return res.status(409).json({ message: "Username or email already exists" });
            }
            return res.status(500).json({ message: "Database error" });
          }

          res.status(201).json({
            id: this.lastID,
            username,
            email,
            role,
            is_active: 1,
            first_name: firstName,
            last_name: lastName,
          });
        }
      );
    });
  });

  app.put("/users/:id", authLimiter, (req, res) => {
    const token = normalizeAuthHeader(req.headers["authorization"]);
    if (!token) {
      return res.status(401).json({ message: "Access denied" });
    }

    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      if (decoded.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = Number(req.params.id);
      const { username, email, role, firstName, lastName, password } = req.body;
      const allowedRoles = new Set(["Admin", "Enseignant"]);

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "Invalid user id" });
      }
      if (!username || !email || !allowedRoles.has(role) || !firstName || !lastName) {
        return res.status(400).json({ message: "username, email, role, firstName and lastName are required" });
      }
      if (password && String(password).length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const updateWithoutPassword = () => {
        db.run(
          `UPDATE users SET username = ?, email = ?, role = ?, first_name = ?, last_name = ? WHERE id = ?`,
          [username, email, role, firstName, lastName, userId],
          function (updateErr) {
            if (updateErr) {
              if (String(updateErr.message || "").includes("UNIQUE")) {
                return res.status(409).json({ message: "Username or email already exists" });
              }
              return res.status(500).json({ message: "Database error" });
            }
            if (this.changes === 0) {
              return res.status(404).json({ message: "User not found" });
            }

            db.get(
              `SELECT id, username, email, role, is_active, first_name, last_name FROM users WHERE id = ?`,
              [userId],
              (fetchErr, user) => {
                if (fetchErr) {
                  return res.status(500).json({ message: "Database error" });
                }
                res.json({
                  id: user.id,
                  username: user.username,
                  email: user.email,
                  role: user.role,
                  is_active: Number(user.is_active) === 1 ? 1 : 0,
                  first_name: user.first_name || "",
                  last_name: user.last_name || "",
                });
              }
            );
          }
        );
      };

      if (!password) {
        return updateWithoutPassword();
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      db.run(
        `UPDATE users SET username = ?, email = ?, role = ?, first_name = ?, last_name = ?, password = ? WHERE id = ?`,
        [username, email, role, firstName, lastName, hashedPassword, userId],
        function (updateErr) {
          if (updateErr) {
            if (String(updateErr.message || "").includes("UNIQUE")) {
              return res.status(409).json({ message: "Username or email already exists" });
            }
            return res.status(500).json({ message: "Database error" });
          }
          if (this.changes === 0) {
            return res.status(404).json({ message: "User not found" });
          }

          db.get(
            `SELECT id, username, email, role, is_active, first_name, last_name FROM users WHERE id = ?`,
            [userId],
            (fetchErr, user) => {
              if (fetchErr) {
                return res.status(500).json({ message: "Database error" });
              }
              res.json({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                is_active: Number(user.is_active) === 1 ? 1 : 0,
                first_name: user.first_name || "",
                last_name: user.last_name || "",
              });
            }
          );
        }
      );
    });
  });

  app.patch("/users/:id/active", authLimiter, (req, res) => {
    const token = normalizeAuthHeader(req.headers["authorization"]);
    if (!token) {
      return res.status(401).json({ message: "Access denied" });
    }

    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      if (decoded.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = Number(req.params.id);
      const isActive = req.body?.isActive;
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "Invalid user id" });
      }
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }
      if (userId === Number(decoded.userId) && !isActive) {
        return res.status(400).json({ message: "You cannot deactivate your own account" });
      }

      db.run(
        `UPDATE users SET is_active = ? WHERE id = ?`,
        [isActive ? 1 : 0, userId],
        function (updateErr) {
          if (updateErr) {
            return res.status(500).json({ message: "Database error" });
          }
          if (this.changes === 0) {
            return res.status(404).json({ message: "User not found" });
          }

          db.get(
            `SELECT id, username, email, role, is_active, first_name, last_name FROM users WHERE id = ?`,
            [userId],
            (fetchErr, user) => {
              if (fetchErr) {
                return res.status(500).json({ message: "Database error" });
              }
              res.json({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                is_active: Number(user.is_active) === 1 ? 1 : 0,
                first_name: user.first_name || "",
                last_name: user.last_name || "",
              });
            }
          );
        }
      );
    });
  });

  app.post("/forgot-password", authLimiter, (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    db.get(`SELECT id, email FROM users WHERE email = ?`, [email], (err, user) => {
      if (err) {
        return res.status(500).json({ message: "Database error" });
      }

      // Prevent email enumeration.
      if (!user) {
        return res.json({
          message: "If this email exists, a reset link has been generated.",
        });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 60 * 60 * 1000;

      db.run(
        `UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?`,
        [token, expiresAt, user.id],
        async (updateErr) => {
          if (updateErr) {
            return res.status(500).json({ message: "Database error" });
          }

          const baseUrl = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 5000}`;
          const resetLink = `${baseUrl}/reset-password?token=${token}`;
          const isProduction = process.env.NODE_ENV === "production";

          try {
            const transporter = createMailTransporter();

            if (!transporter) {
              const genericMessage = "If this email exists, a reset link has been generated.";

              // Local/dev fallback: allow password reset without SMTP infra.
              if (!isProduction) {
                console.warn(
                  "SMTP is not configured. Returning reset link in response for non-production use.",
                  { email, resetLink }
                );
                return res.json({
                  message: `${genericMessage} SMTP is not configured, using local reset link fallback.`,
                  resetLink,
                });
              }

              console.error(
                "SMTP is not configured in production. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS."
              );
              return res.status(503).json({
                message: "Password reset email service is not configured.",
              });
            }

            await transporter.sendMail({
              from: PASSWORD_RESET_FROM,
              to: email,
              subject: "Password reset link",
              text: `Use this link to reset your password: ${resetLink}`,
              html: `<p>Use this link to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`,
            });

            res.json({
              message: "If this email exists, a reset link has been generated.",
            });
          } catch (mailErr) {
            console.error("Failed to send reset password email:", mailErr);
            return res.status(500).json({
              message: "Unable to send reset email right now.",
            });
          }
        }
      );
    });
  });

  app.post("/reset-password", authLimiter, (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || String(newPassword).length < 8) {
      return res
        .status(400)
        .json({ message: "token and a newPassword (min 8 chars) are required" });
    }

    db.get(
      `SELECT id, reset_token_expires FROM users WHERE reset_token = ?`,
      [token],
      (err, user) => {
        if (err) {
          return res.status(500).json({ message: "Database error" });
        }
        if (!user || !user.reset_token_expires || Number(user.reset_token_expires) < Date.now()) {
          return res.status(400).json({ message: "Invalid or expired reset token" });
        }

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        db.run(
          `UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?`,
          [hashedPassword, user.id],
          (updateErr) => {
            if (updateErr) {
              return res.status(500).json({ message: "Database error" });
            }
            res.json({ message: "Password reset successful" });
          }
        );
      }
    );
  });
};

module.exports = {
  registerAuthRoutes,
};
