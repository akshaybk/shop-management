import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

const canAccessShop = async (user, shopId) => {
  if (user.role === "SUPER_MANAGER") return true;
  if (user.role === "MANAGER") {
    const assignment = await prisma.managerShop.findUnique({
      where: { managerId_shopId: { managerId: user.userId, shopId } },
    });
    return Boolean(assignment);
  }
  if (user.role === "SHAREHOLDER") {
    const assignment = await prisma.shareholderShop.findUnique({
      where: { shareholderId_shopId: { shareholderId: user.userId, shopId } },
    });
    return Boolean(assignment);
  }
  return false;
};

const startOfDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfNextDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

const getShopDashboard = async (shopId) => {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return null;

  const todayStart = startOfDay();
  const tomorrowStart = startOfNextDay();

  const [sales, purchases, expenses, inventory, recentSales, recentPurchases, recentExpenses] = await Promise.all([
    prisma.sale.aggregate({ where: { shopId }, _sum: { totalAmount: true, quantity: true } }),
    prisma.stockPurchase.aggregate({ where: { shopId }, _sum: { totalCost: true, quantity: true } }),
    prisma.expense.aggregate({ where: { shopId }, _sum: { amount: true } }),
    prisma.inventory.findMany({ where: { shopId }, include: { product: true }, orderBy: { updatedAt: "desc" } }),
    prisma.sale.findMany({ where: { shopId, soldAt: { gte: todayStart, lt: tomorrowStart } }, include: { product: true }, orderBy: { soldAt: "desc" }, take: 5 }),
    prisma.stockPurchase.findMany({ where: { shopId, purchasedAt: { gte: todayStart, lt: tomorrowStart } }, include: { product: true }, orderBy: { purchasedAt: "desc" }, take: 5 }),
    prisma.expense.findMany({ where: { shopId, expenseDate: { gte: todayStart, lt: tomorrowStart } }, orderBy: { expenseDate: "desc" }, take: 5 }),
  ]);

  const totalSales = sales._sum.totalAmount ?? 0;
  const totalPurchases = purchases._sum.totalCost ?? 0;
  const totalExpenses = expenses._sum.amount ?? 0;
  const balance = shop.openingBalance + totalSales - totalPurchases - totalExpenses;

  const todaySales = recentSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const todayPurchases = recentPurchases.reduce((sum, purchase) => sum + purchase.totalCost, 0);
  const todayExpenses = recentExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return {
    shop: { id: shop.id, name: shop.name, location: shop.location, active: shop.active },
    financial: {
      openingBalance: shop.openingBalance,
      currentBalance: balance,
      totalSales,
      totalPurchases,
      totalExpenses,
    },
    today: {
      sales: todaySales,
      purchases: todayPurchases,
      expenses: todayExpenses,
      netChange: todaySales - todayPurchases - todayExpenses,
    },
    inventory: inventory.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      unit: item.product.unit,
      quantity: item.quantity,
      sellingPrice: item.product.sellingPrice,
      lowStock: item.quantity <= 10,
    })),
    recentTransactions: [
      ...recentSales.map((sale) => ({ type: "SALE", id: sale.id, productName: sale.product.name, quantity: sale.quantity, amount: sale.totalAmount, date: sale.soldAt })),
      ...recentPurchases.map((purchase) => ({ type: "PURCHASE", id: purchase.id, productName: purchase.product.name, quantity: purchase.quantity, amount: purchase.totalCost, date: purchase.purchasedAt })),
      ...recentExpenses.map((expense) => ({ type: "EXPENSE", id: expense.id, category: expense.category, amount: expense.amount, date: expense.expenseDate })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10),
  };
};

router.get("/shop/:shopId", async (req, res) => {
  const shopId = Number(req.params.shopId);
  if (!Number.isInteger(shopId) || shopId <= 0) {
    return res.status(400).json({ success: false, message: "Invalid shopId" });
  }

  if (!(await canAccessShop(req.user, shopId))) {
    return res.status(403).json({ success: false, message: "You do not have access to this shop" });
  }

  try {
    const dashboard = await getShopDashboard(shopId);
    if (!dashboard) return res.status(404).json({ success: false, message: "Shop not found" });
    return res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
});

router.get("/", async (req, res) => {
  if (req.user.role !== "SUPER_MANAGER") {
    return res.status(403).json({ success: false, message: "Only the Super Manager can access the overall dashboard" });
  }

  try {
    const shops = await prisma.shop.findMany({ where: { active: true }, orderBy: { id: "asc" } });
    const dashboards = await Promise.all(shops.map((shop) => getShopDashboard(shop.id)));

    const totals = dashboards.reduce((acc, dashboard) => {
      acc.currentBalance += dashboard.financial.currentBalance;
      acc.totalSales += dashboard.financial.totalSales;
      acc.totalPurchases += dashboard.financial.totalPurchases;
      acc.totalExpenses += dashboard.financial.totalExpenses;
      acc.todaySales += dashboard.today.sales;
      acc.todayPurchases += dashboard.today.purchases;
      acc.todayExpenses += dashboard.today.expenses;
      return acc;
    }, { currentBalance: 0, totalSales: 0, totalPurchases: 0, totalExpenses: 0, todaySales: 0, todayPurchases: 0, todayExpenses: 0 });

    return res.json({
      success: true,
      data: {
        shopCount: shops.length,
        totals,
        shops: dashboards.map((dashboard) => ({
          ...dashboard.shop,
          currentBalance: dashboard.financial.currentBalance,
          todaySales: dashboard.today.sales,
          todayExpenses: dashboard.today.expenses,
          inventoryItems: dashboard.inventory.length,
          lowStockItems: dashboard.inventory.filter((item) => item.lowStock).length,
        })),
      },
    });
  } catch (error) {
    console.error("Overall dashboard error:", error);
    return res.status(500).json({ success: false, message: "Failed to load overall dashboard" });
  }
});

export default router;
