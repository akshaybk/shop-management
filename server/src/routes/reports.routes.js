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

const formatDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

const getStockReport = async (shopId, start, end) => {
  const [purchases, sales, adjustments] = await Promise.all([
    prisma.stockPurchase.findMany({
      where: { shopId, purchasedAt: { gte: start, lt: end } },
      select: { productId: true, quantity: true },
    }),
    prisma.sale.findMany({
      where: { shopId, soldAt: { gte: start, lt: end } },
      select: { productId: true, quantity: true, totalAmount: true, unitSellingPrice: true },
    }),
    prisma.stockAdjustment.findMany({
      where: { shopId, adjustedAt: { gte: start, lt: end } },
      select: { productId: true, quantityChange: true },
    }),
  ]);

  const productIds = [...new Set([
    ...purchases.map((item) => item.productId),
    ...sales.map((item) => item.productId),
    ...adjustments.map((item) => item.productId),
  ])];

  if (productIds.length === 0) return [];

  const [products, stockBefore] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } } }),
    Promise.all(productIds.map(async (productId) => {
      const [p, s, a] = await Promise.all([
        prisma.stockPurchase.aggregate({ where: { shopId, productId, purchasedAt: { lt: start } }, _sum: { quantity: true } }),
        prisma.sale.aggregate({ where: { shopId, productId, soldAt: { lt: start } }, _sum: { quantity: true } }),
        prisma.stockAdjustment.aggregate({ where: { shopId, productId, adjustedAt: { lt: start } }, _sum: { quantityChange: true } }),
      ]);
      return [productId, (p._sum.quantity ?? 0) - (s._sum.quantity ?? 0) + (a._sum.quantityChange ?? 0)];
    })),
  ]);

  const map = new Map(productIds.map((id) => [id, {
    productId: id,
    product: products.find((product) => product.id === id),
    openingStock: 0,
    purchased: 0,
    sold: 0,
    adjustment: 0,
    salesAmount: 0,
    closingStock: 0,
  }]));

  for (const [productId, quantity] of stockBefore) map.get(productId).openingStock = quantity;
  for (const item of purchases) map.get(item.productId).purchased += item.quantity;
  for (const item of sales) {
    const row = map.get(item.productId);
    row.sold += item.quantity;
    row.salesAmount += item.totalAmount;
  }
  for (const item of adjustments) map.get(item.productId).adjustment += item.quantityChange;

  for (const row of map.values()) {
    row.closingStock = row.openingStock + row.purchased - row.sold + row.adjustment;
  }

  return [...map.values()].map((row) => ({
    productId: row.productId,
    productName: row.product?.name ?? "Unknown product",
    unit: row.product?.unit ?? "piece",
    openingStock: row.openingStock,
    purchased: row.purchased,
    sold: row.sold,
    adjustment: row.adjustment,
    closingStock: row.closingStock,
    salesAmount: row.salesAmount,
  }));
};

const getExpenseBreakdown = async (shopId, start, end) => {
  const expenses = await prisma.expense.findMany({
    where: { shopId, expenseDate: { gte: start, lt: end } },
    select: { id: true, category: true, description: true, amount: true, frequency: true, expenseDate: true },
    orderBy: { expenseDate: "asc" },
  });

  const breakdown = {};
  for (const expense of expenses) {
    if (!breakdown[expense.frequency]) breakdown[expense.frequency] = { amount: 0, count: 0 };
    breakdown[expense.frequency].amount += expense.amount;
    breakdown[expense.frequency].count += 1;
  }

  return { total: expenses.reduce((sum, item) => sum + item.amount, 0), breakdown, transactions: expenses };
};

const getFinancialReport = async (shopId, start, end) => {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return null;

  const [sales, purchases, expenses, beforeSales, beforePurchases, beforeExpenses] = await Promise.all([
    prisma.sale.aggregate({ where: { shopId, soldAt: { gte: start, lt: end } }, _sum: { totalAmount: true, quantity: true } }),
    prisma.stockPurchase.aggregate({ where: { shopId, purchasedAt: { gte: start, lt: end } }, _sum: { totalCost: true, quantity: true } }),
    prisma.expense.aggregate({ where: { shopId, expenseDate: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.sale.aggregate({ where: { shopId, soldAt: { lt: start } }, _sum: { totalAmount: true } }),
    prisma.stockPurchase.aggregate({ where: { shopId, purchasedAt: { lt: start } }, _sum: { totalCost: true } }),
    prisma.expense.aggregate({ where: { shopId, expenseDate: { lt: start } }, _sum: { amount: true } }),
  ]);

  const openingBalance = shop.openingBalance
    + (beforeSales._sum.totalAmount ?? 0)
    - (beforePurchases._sum.totalCost ?? 0)
    - (beforeExpenses._sum.amount ?? 0);
  const salesAmount = sales._sum.totalAmount ?? 0;
  const purchaseAmount = purchases._sum.totalCost ?? 0;
  const expenseAmount = expenses._sum.amount ?? 0;

  return {
    openingBalance,
    sales: { amount: salesAmount, quantity: sales._sum.quantity ?? 0 },
    purchases: { amount: purchaseAmount, quantity: purchases._sum.quantity ?? 0 },
    expenses: expenseAmount,
    closingBalance: openingBalance + salesAmount - purchaseAmount - expenseAmount,
  };
};

router.get("/daily/:shopId", async (req, res) => {
  try {
    const shopId = Number(req.params.shopId);
    if (!Number.isInteger(shopId) || shopId <= 0) return res.status(400).json({ success: false, message: "Invalid shop id" });
    if (!(await canAccessShop(req.user, shopId))) return res.status(403).json({ success: false, message: "You do not have access to this shop" });

    const date = parseDate(req.query.date, new Date());
    if (!date) return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD" });
    const start = startOfDay(date);
    const end = endOfDay(date);

    const [financial, stock, expenseReport] = await Promise.all([
      getFinancialReport(shopId, start, end),
      getStockReport(shopId, start, end),
      getExpenseBreakdown(shopId, start, end),
    ]);

    if (!financial) return res.status(404).json({ success: false, message: "Shop not found" });

    return res.json({
      success: true,
      report: {
        shopId,
        date: formatDate(start),
        ...financial,
        expenses: expenseReport.total,
        expenseBreakdown: expenseReport.breakdown,
        expenseTransactions: expenseReport.transactions,
        inventory: stock,
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
    if (!Number.isInteger(shopId) || shopId <= 0) return res.status(400).json({ success: false, message: "Invalid shop id" });
    if (!(await canAccessShop(req.user, shopId))) return res.status(403).json({ success: false, message: "You do not have access to this shop" });

    const month = req.query.month ? String(req.query.month) : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ success: false, message: "Month must use YYYY-MM format" });

    const [year, monthNumber] = month.split("-").map(Number);
    const start = new Date(year, monthNumber - 1, 1);
    if (start.getFullYear() !== year || start.getMonth() !== monthNumber - 1) return res.status(400).json({ success: false, message: "Invalid month" });
    const end = new Date(year, monthNumber, 1);

    const [financial, stock, expenseReport] = await Promise.all([
      getFinancialReport(shopId, start, end),
      getStockReport(shopId, start, end),
      getExpenseBreakdown(shopId, start, end),
    ]);

    if (!financial) return res.status(404).json({ success: false, message: "Shop not found" });

    return res.json({
      success: true,
      report: {
        shopId,
        month,
        ...financial,
        expenses: expenseReport.total,
        expenseBreakdown: expenseReport.breakdown,
        expenseTransactions: expenseReport.transactions,
        inventory: stock,
      },
    });
  } catch (error) {
    console.error("Monthly report failed:", error);
    return res.status(500).json({ success: false, message: "Unable to generate monthly report" });
  }
});

export default router;
