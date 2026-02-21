const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { all, get, run } = require("../db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
const storageDir = process.env.STORAGE_DIR
  ? path.resolve(process.cwd(), process.env.STORAGE_DIR)
  : path.join(__dirname, "..", "storage");

fs.mkdirSync(storageDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, storageDir),
  filename: (req, file, cb) => {
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    cb(null, safe);
  },
});

const allowedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("File type is not allowed."));
    }
    cb(null, true);
  },
});

async function renderDashboard(res, currentUser, error = null, success = null, statusCode = 200) {
  const users = await all("SELECT id, username, role, created_at FROM users ORDER BY username");
  const files = await all(`
    SELECT f.id, f.original_name, f.upload_date, f.size_bytes,
           u.username AS assigned_user,
           a.username AS uploaded_by
    FROM files f
    JOIN users u ON u.id = f.assigned_user_id
    JOIN users a ON a.id = f.uploaded_by_id
    ORDER BY f.upload_date DESC
  `);

  return res.status(statusCode).render("admin-dashboard", {
    currentUser,
    users,
    normalUsers: users.filter((u) => u.role === "user"),
    files,
    error,
    success,
  });
}

async function safeDeleteUploadedFile(file) {
  if (!file || !file.path) return;
  try {
    await fsp.unlink(file.path);
  } catch (_err) {
    // Best effort cleanup for failed uploads.
  }
}

router.get("/dashboard", requireRole("admin"), async (req, res) => {
  try {
    await renderDashboard(res, req.session.user);
  } catch (err) {
    res.status(500).send("Unable to load dashboard");
  }
});

router.post("/users", requireRole("admin"), async (req, res) => {
  try {
    const { username, password, confirmPassword, role } = req.body;
    const cleanUsername = typeof username === "string" ? username.trim() : "";
    const assignedRole = role === "admin" ? "admin" : "user";

    if (!cleanUsername || !password) {
      return renderDashboard(
        res,
        req.session.user,
        "Username and password are required to create a user.",
        null,
        400
      );
    }

    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(cleanUsername)) {
      return renderDashboard(
        res,
        req.session.user,
        "Username must be 3-30 chars and use letters, numbers, dot, underscore, or dash.",
        null,
        400
      );
    }

    if (password.length < 8) {
      return renderDashboard(
        res,
        req.session.user,
        "Password must be at least 8 characters.",
        null,
        400
      );
    }

    if (password !== confirmPassword) {
      return renderDashboard(res, req.session.user, "Passwords do not match.", null, 400);
    }

    const existing = await get("SELECT id FROM users WHERE username = ?", [cleanUsername]);
    if (existing) {
      return renderDashboard(res, req.session.user, "Username already exists.", null, 409);
    }

    const hash = await bcrypt.hash(password, 12);
    await run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [
      cleanUsername,
      hash,
      assignedRole,
    ]);

    return renderDashboard(
      res,
      req.session.user,
      null,
      `User '${cleanUsername}' created successfully as ${assignedRole}.`
    );
  } catch (err) {
    return res.status(500).send("Unable to create user.");
  }
});

router.post("/upload", requireRole("admin"), (req, res) => {
  upload.single("file")(req, res, async (err) => {
    try {
      if (err) {
        return renderDashboard(res, req.session.user, err.message, null, 400);
      }

      const { assignedUserId } = req.body;
      if (!assignedUserId || !req.file) {
        await safeDeleteUploadedFile(req.file);
        return renderDashboard(res, req.session.user, "Assigned user and file are required.", null, 400);
      }

      const user = await get("SELECT id, role FROM users WHERE id = ?", [assignedUserId]);
      if (!user || user.role !== "user") {
        await safeDeleteUploadedFile(req.file);
        return renderDashboard(res, req.session.user, "Assigned user is invalid.", null, 400);
      }

      await run(
        `INSERT INTO files (original_name, stored_name, mime_type, size_bytes, assigned_user_id, uploaded_by_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.file.originalname,
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          assignedUserId,
          req.session.user.id,
        ]
      );

      return renderDashboard(
        res,
        req.session.user,
        null,
        `File '${req.file.originalname}' uploaded and assigned successfully.`
      );
    } catch (e) {
      await safeDeleteUploadedFile(req.file);
      return renderDashboard(res, req.session.user, "Upload failed.", null, 500);
    }
  });
});

router.get("/files/:id/download", requireRole("admin"), async (req, res) => {
  try {
    const file = await get("SELECT original_name, stored_name FROM files WHERE id = ?", [req.params.id]);
    if (!file) return res.status(404).send("File not found");

    const filePath = path.join(storageDir, file.stored_name);
    return res.download(filePath, file.original_name);
  } catch (err) {
    return res.status(500).send("Could not download file");
  }
});

module.exports = router;
