const jwt = require("jsonwebtoken");
require("dotenv").config();
const SECRET = process.env.JWT_SECRET;
const REF_SECRET = process.env.JWT_REFRESH_SECRET;
exports.signAccess = (payload) =>
  jwt.sign(payload, SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "4d",
  });
exports.signRefresh = (payload) =>
  jwt.sign(payload, REF_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  });
exports.verifyAccess = (token) => jwt.verify(token, SECRET);
exports.verifyRefresh = (token) => jwt.verify(token, REF_SECRET);
