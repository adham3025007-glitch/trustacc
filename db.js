const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, "data", "app.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initializeDatabase() {
  await run("PRAGMA foreign_keys = ON");

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      upload_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      assigned_user_id INTEGER NOT NULL,
      uploaded_by_id INTEGER NOT NULL,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  const adminExists = await get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!adminExists) {
    const hash = await bcrypt.hash("admin123", 12);
    await run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
      ["admin", hash]
    );
  }

  const userExists = await get("SELECT id FROM users WHERE username = ?", ["user1"]);
  if (!userExists) {
    const hash = await bcrypt.hash("user123", 12);
    await run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')",
      ["user1", hash]
    );
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initializeDatabase,
};
