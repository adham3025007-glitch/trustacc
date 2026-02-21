function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login/user");
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect(role === "admin" ? "/login/admin" : "/login/user");
    }

    if (req.session.user.role !== role) {
      return res.redirect(req.session.user.role === "admin" ? "/admin/dashboard" : "/user/dashboard");
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
