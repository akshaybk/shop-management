import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

const canAccessShop = async (user, shopId) => {
  if (user.role === "SUPER_MANAGER") return true;
  if (user.role !== "MANAGER") return false;

  const assignment = await prisma.managerShop.findUnique({
    where: { managerId_shopId: { managerId: user.userId, shopId } },
  });

  return Boolean(assignment);
};

router.post("/", async (req, res) => {
  try {
    const shopId = Number(req.body.shopId);
    const category = req.body.category?.trim();
    const description = req.body.description?.trim() || null;
    const amount = Number(req.body.amount);
    const frequency = String(req.body.frequency || "DAILY").toUpperCase();
    const expenseDate = req.body.expenseDate ? new Date(req.body.expenseDate) : new Date();

    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ success: false, message: "Valid shopId is required" });
    }
    if (!category) {
      return res.status(400).json({ success: false, message: "Expense category is required" });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Expense amount must be greater than zero" });
    }
    if (!["DAILY", "MONTHLY"].includes(frequency)) {
      return res.status(400).json({ success: false, message: "Frequency must be DAILY or MONTHLY" });
    }
    if (Number.isNaN(expenseDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid expense date" });
    }
    if (!(await canAccessShop(req.user, shopId))) {
      return res.status(403).json({ success: false, message: "You do not have access to this shop" });
    }

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop || !shop.active) {
      return res.status(404).json({ success: false, message: "Active shop not found" });
    }

    const expense = await prisma.expense.create({
      data: {
        shopId,
        category,
        description,
        amount,
        frequency,
        expenseDate,
        createdById: req.user.userId,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Expense recorded successfully",
      expense,
    });
  } catch (error) {
    console.error("Creating expense failed:", error);
    return res.status(500).json({ success: false, message: "Unable to record expense" });
  }
});

router.get("/shop/:shopId", async (req, res) => {
  try {
    const shopId = Number(req.params.shopId);
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid shop id" });
    }
    if (!(await canAccessShop(req.user, shopId))) {
      return res.status(403).json({ success: false, message: "You do not have access to this shop" });
    }

    const expenses = await prisma.expense.findMany({
      where: { shopId },
      include: { createdBy: { select: { id: true, name: true, role: true } } },
      orderBy: { expenseDate: "desc" },
    });

    return res.json({ success: true, expenses });
  } catch (error) {
    console.error("Listing expenses failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch expenses" });
  }
});

export default router;
