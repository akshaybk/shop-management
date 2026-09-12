import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";

const router = Router();

const ALLOWED_ROLES = ["MANAGER", "SHAREHOLDER"];

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

router.use(authenticate, authorizeRoles("SUPER_MANAGER"));

// List all users except the current Super Manager account.
router.get("/", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: { in: ALLOWED_ROLES },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      users: users.map(publicUser),
    });
  } catch (error) {
    console.error("Listing users failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch users",
    });
  }
});

// Create a Manager or Shareholder.
router.post("/", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !email?.trim() || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and role are required",
      });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be MANAGER or SHAREHOLDER",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role,
      },
    });

    return res.status(201).json({
      success: true,
      message: `${role === "MANAGER" ? "Manager" : "Shareholder"} created successfully`,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Creating user failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create user",
    });
  }
});

// Activate/deactivate a Manager or Shareholder without deleting history.
router.patch("/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    const { active } = req.body;

    if (typeof active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Active must be a boolean",
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });

    if (!existingUser || !ALLOWED_ROLES.includes(existingUser.role)) {
      return res.status(404).json({
        success: false,
        message: "Manager or Shareholder not found",
      });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { active },
    });

    return res.json({
      success: true,
      message: active ? "User activated" : "User deactivated",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Updating user status failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update user status",
    });
  }
});

export default router;
