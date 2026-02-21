const express = require("express");
const bcrypt = require("bcryptjs");
const { get } = require("../db");

const router = express.Router();
const DUMMY_HASH = "$2a$12$zsM5w4Y4J7dR2eFSfQ5AkuM2Wg9Hf5aS4I6DzhM4JfMLn7P4mSN.C";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const attemptsByKey = new Map();

function loginKey(req, expectedRole, username) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown-ip";
  return `${ip}:${expectedRole}:${(username || "").toLowerCase()}`;
}

function getBucket(key) {
  const now = Date.now();
  const bucket = attemptsByKey.get(key);

  if (!bucket) {
    const fresh = { count: 0, firstAttemptAt: now, lockedUntil: 0 };
    attemptsByKey.set(key, fresh);
    return fresh;
  }

  if (bucket.lockedUntil && now > bucket.lockedUntil) {
    bucket.count = 0;
    bucket.firstAttemptAt = now;
    bucket.lockedUntil = 0;
  }

  if (now - bucket.firstAttemptAt > WINDOW_MS) {
    bucket.count = 0;
    bucket.firstAttemptAt = now;
  }

  return bucket;
}

function registerFailedAttempt(key) {
  const now = Date.now();
  const bucket = getBucket(key);
  bucket.count += 1;

  if (bucket.count >= MAX_ATTEMPTS) {
    bucket.lockedUntil = now + LOCK_MS;
  }
}

function clearFailedAttempts(key) {
  attemptsByKey.delete(key);
}

function ensureLoggedOutLoginPage(req, res, role) {
  if (!req.session.user) return null;
  if (req.session.user.role === role) return res.redirect(role === "admin" ? "/admin/dashboard" : "/user/dashboard");
  return res.redirect(req.session.user.role === "admin" ? "/admin/dashboard" : "/user/dashboard");
}

router.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login/user");
  return res.redirect(req.session.user.role === "admin" ? "/admin/dashboard" : "/user/dashboard");
});

router.get("/login/admin", (req, res) => {
  const redirectResponse = ensureLoggedOutLoginPage(req, res, "admin");
  if (redirectResponse) return;
  res.render("login", { role: "admin", error: null });
});

router.get("/login/user", (req, res) => {
  const redirectResponse = ensureLoggedOutLoginPage(req, res, "user");
  if (redirectResponse) return;
  res.render("login", { role: "user", error: null });
});

async function loginHandler(req, res, expectedRole) {
  try {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const key = loginKey(req, expectedRole, username);
    const bucket = getBucket(key);
    const now = Date.now();

    if (bucket.lockedUntil && now < bucket.lockedUntil) {
      const retryInMinutes = Math.ceil((bucket.lockedUntil - now) / 60000);
      return res
        .status(429)
        .render("login", { role: expectedRole, error: `Too many attempts. Try again in ${retryInMinutes} minute(s).` });
    }

    if (!username || !password) {
      return res.status(400).render("login", { role: expectedRole, error: "Username and password are required." });
    }

    const user = await get("SELECT id, username, password_hash, role FROM users WHERE username = ?", [username]);
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || user.role !== expectedRole || !valid) {
      registerFailedAttempt(key);
      return res.status(401).render("login", { role: expectedRole, error: "Invalid credentials." });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    clearFailedAttempts(key);

    return res.redirect(expectedRole === "admin" ? "/admin/dashboard" : "/user/dashboard");
  } catch (err) {
    return res.status(500).render("login", { role: expectedRole, error: "Unexpected server error." });
  }
}

router.post("/login/admin", (req, res) => loginHandler(req, res, "admin"));
router.post("/login/user", (req, res) => loginHandler(req, res, "user"));

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login/user");
  });
});

module.exports = router;
