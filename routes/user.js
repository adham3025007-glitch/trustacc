const path = require("path");
const express = require("express");
const { all, get } = require("../db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
const storageDir = process.env.STORAGE_DIR
  ? path.resolve(process.cwd(), process.env.STORAGE_DIR)
  : path.join(__dirname, "..", "storage");

router.get("/dashboard", requireRole("user"), async (req, res) => {
  try {
    const files = await all(
      `SELECT id, original_name, upload_date, size_bytes
       FROM files
       WHERE assigned_user_id = ?
       ORDER BY upload_date DESC`,
      [req.session.user.id]
    );

    res.render("user-dashboard", {
      currentUser: req.session.user,
      files,
    });
  } catch (err) {
    res.status(500).send("Unable to load dashboard");
  }
});

router.get("/files/:id/download", requireRole("user"), async (req, res) => {
  try {
    const file = await get(
      `SELECT original_name, stored_name
       FROM files
       WHERE id = ? AND assigned_user_id = ?`,
      [req.params.id, req.session.user.id]
    );

    if (!file) return res.status(404).send("File not found or access denied");

    const filePath = path.join(storageDir, file.stored_name);
    return res.download(filePath, file.original_name);
  } catch (err) {
    return res.status(500).send("Could not download file");
  }
});

module.exports = router;
