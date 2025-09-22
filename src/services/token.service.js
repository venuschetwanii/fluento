const jwt = require("jsonwebtoken");
require("dotenv").config();
const SECRET = process.env.JWT_SECRET;

// Issue only access tokens with 7-day expiry
exports.signAccess = (payload) =>
  jwt.sign(payload, SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "7d",
  });

exports.verifyAccess = (token) => jwt.verify(token, SECRET);
