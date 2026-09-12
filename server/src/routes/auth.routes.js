import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }

  return secret;
};

const createToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: "8h" },
  );

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
});

// One-time bootstrap endpoint for the local prototype.
// It only works while the database contains no users.
router.post("/setup", async (req, res) => {
  try {
    const existingUser = await prisma.user.findFirst();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Initial setup has already been completed",
      });
    }

    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: "SUPER_MANAGER",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Super Manager created successfully",
      user: publicUser(user),
      token: createToken(user),
    });
  } catch (error) {
    console.error("Initial setup failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to complete initial setup",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !user.active) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    return res.json({
      success: true,
      message: "Login successful",
      user: publicUser(user),
      token: createToken(user),
    });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to log in",
    });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.user.userId) },
    });

    if (!user || !user.active) {
      return res.status(401).json({
        success: false,
        message: "User account is unavailable",
      });
    }

    return res.json({
      success: true,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Fetching current user failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch current user",
    });
  }
});

export default router;
