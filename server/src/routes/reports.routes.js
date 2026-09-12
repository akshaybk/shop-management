import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

const canAccessShop = async (user, shopId) => {
  if (user.role === "SUPER_MANAGER") return true;
  if (user.role === "MANAGER") {
    return Boolean(await prisma.managerShop.findUnique({
      where: { managerId_shopId: { managerId: user.userId, shopId } },
    }));
  }
  if (user.role === "SHAREHOLDER") {
    return Boolean(await prisma.shareholderShop.findUnique({
      where: { shareholderId_shopId: { shareholderId: user.userId, shopId } },
    }));
  }
  return false;
};

const parseDate = (value, fallback) => {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return date;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

router.get("/daily/:shopId", async (req, res) => {
  try {
    const shopId = Number(req.params.shopId);
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid shop id" });
    }
    if (!(await canAccessShop(req.user, shopId))) {
      return res.status(403).json({ success: false, message: "You do not have access to this shop" });
    }

    const date = parseDate(req.query.date, new Date());
    if (!date) return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD" });

    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });

    const [sales, purchases, expenses, adjustments] = await Promise.all([
      prisma.sale.aggregate({ where: { shopId, soldAt: { gte: dayStart, lt: dayEnd } }, _sum: { totalAmount: true, quantity: true } }),
      prisma.stockPurchase.aggregate({ where: { shopId, purchasedAt: { gte: dayStart, lt: dayEnd } }, _sum: { totalCost: true, quantity: true } }),
      prisma.expense.aggregate({ where: { shopId, expenseDate: { gte: dayStart, lt: dayEnd } }, _sum: { amount: true } }),
      prisma.stockAdjustment.aggregate({ where: { shopId, adjustedAt: { gte: dayStart, lt: dayEnd } }, _sum: { quantityChange: true } }),
    ]);

    const totalSales = sales._sum.totalAmount ?? 0;
    const totalPurchases = purchases._sum.totalCost ?? 0;
    const totalExpenses = expenses._sum.amount ?? 0;

    const [beforeSales, beforePurchases, beforeExpenses] = await Promise.all([
      prisma.sale.aggregate({ where: { shopId, soldAt: { lt: dayStart } }, _sum: { totalAmount: true } }),
      prisma.stockPurchase.aggregate({ where: { shopId, purchasedAt: { lt: dayStart } }, _sum: { totalCost: true } }),
      prisma.expense.aggregate({ where: { shopId, expenseDate: { lt: dayStart } }, _sum: { amount: true } }),
    ]);

    const openingBalance = shop.openingBalance
      + (beforeSales._sum.totalAmount ?? 0)
      - (beforePurchases._sum.totalCost ?? 0)
      - (beforeExpenses._sum.amount ?? 0);

    return res.json({
      success: true,
      report: {
        shopId,
        date: `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`,
        openingBalance,
        sales: { amount: totalSales, quantity: sales._sum.quantity ?? 0 },
        purchases: { amount: totalPurchases, quantity: purchases._sum.quantity ?? 0 },
        expenses: totalExpenses,
        stockAdjustmentQuantity: adjustments._sum.quantityChange ?? 0,
        closingBalance: openingBalance + totalSales - totalPurchases - totalExpenses,
      },
    });
  } catch (error) {
    console.error("Daily report failed:", error);
    return res.status(500).json({ success: false, message: "Unable to generate daily report" });
  }
});

router.get("/monthly/:shopId", async (req, res) => {
  try {
    const shopId = Number(req.params.shopId);
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid shop id" });
    }
    if (!(await canAccessShop(req.user, shopId))) {
      return res.status(403).json({ success: false, message: "You do not have access to this shop" });
    }

    const month = req.query.month ? String(req.query.month) : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "Month must use YYYY-MM format" });
    }

    const [year, monthNumber] = month.split("-").map(Number);
    const monthStart = new Date(year, monthNumber - 1, 1);
    if (monthStart.getFullYear() !== year || monthStart.getMonth() !== monthNumber - 1) {
      return res.status(400).json({ success: false, message: "Invalid month" });
    }
    const monthEnd = new Date(year, monthNumber, 1);

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });

    const [sales, purchases, expenses] = await Promise.all([
      prisma.sale.aggregate({ where: { shopId, soldAt: { gte: monthStart, lt: monthEnd } }, _sum: { totalAmount: true, quantity: true } }),
      prisma.stockPurchase.aggregate({ where: { shopId, purchasedAt: { gte: monthStart, lt: monthEnd } }, _sum: { totalCost: true, quantity: true } }),
      prisma.expense.aggregate({ where: { shopId, expenseDate: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } }),
    ]);

    const [priorSales, priorPurchases, priorExpenses] = await Promise.all([
      prisma.sale.aggregate({ where: { shopId, soldAt: { lt: monthStart } }, _sum: { totalAmount: true } }),
      prisma.stockPurchase.aggregate({ where: { shopId, purchasedAt: { lt: monthStart } }, _sum: { totalCost: true } }),
      prisma.expense.aggregate({ where: { shopId, expenseDate: { lt: monthStart } }, _sum: { amount: true } }),
    ]);

    const openingBalance = shop.openingBalance
      + (priorSales._sum.totalAmount ?? 0)
      - (priorPurchases._sum.totalCost ?? 0)
      - (priorExpenses._sum.amount ?? 0);

    const totalSales = sales._sum.totalAmount ?? 0;
    const totalPurchases = purchases._sum.totalCost ?? 0;
    const totalExpenses = expenses._sum.amount ?? 0;

    return res.json({
      success: true,
      report: {
        shopId,
        month,
        openingBalance,
        sales: { amount: totalSales, quantity: sales._sum.quantity ?? 0 },
        purchases: { amount: totalPurchases, quantity: purchases._sum.quantity ?? 0 },
        expenses: totalExpenses,
        closingBalance: openingBalance + totalSales - totalPurchases - totalExpenses,
      },
    });
  } catch (error) {
    console.error("Monthly report failed:", error);
    return res.status(500).json({ success: false, message: "Unable to generate monthly report" });
  }
});

export default router;
