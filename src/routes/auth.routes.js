const Router = require("express").Router;
const bcrypt = require("bcryptjs");
const UserModel = require("../models/user.model");
const { signAccess } = require("../services/token.service");
const router = Router();
router.post("/register", async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = new UserModel({ name, email, passwordHash: hash, role });
    await user.save();
    res.json({ message: "Registered" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await UserModel.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    const payload = { id: user._id, role: user.role };
    const accessToken = signAccess(payload);
    res.json({
      accessToken: `Bearer ${accessToken}`,
      user,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Refresh token route removed: using only 7-day access tokens
module.exports = router;
