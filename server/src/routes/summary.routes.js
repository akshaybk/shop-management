import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

const canAccessShop = async (user, shopId) => {
  if (user.role === "SUPER_MANAGER") return true;
  if (user.role !== "MANAGER" && user.role !== "SHAREHOLDER") return false;

  if (user.role === "MANAGER") {
    const assignment = await prisma.managerShop.findUnique({
      where: { managerId_shopId: { managerId: user.userId, shopId } },
    });
    return Boolean(assignment);
  }

  const assignment = await prisma.shareholderShop.findUnique({
    where: { shareholderId_shopId: { shareholderId: user.userId, shopId } },
  });
  return Boolean(assignment);
};

router.get("/shop/:shopId", async (req, res) => {
  try {
    const shopId = Number(req.params.shopId);
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid shop id" });
    }
    if (!(await canAccessShop(req.user, shopId))) {
      return res.status(403).json({ success: false, message: "You do not have access to this shop" });
    }

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });

    const [purchases, sales, dailyExpenses, monthlyExpenses, inventory] = await Promise.all([
      prisma.stockPurchase.aggregate({ where: { shopId }, _sum: { totalCost: true } }),
      prisma.sale.aggregate({ where: { shopId }, _sum: { totalAmount: true } }),
      prisma.expense.aggregate({ where: { shopId, frequency: "DAILY" }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { shopId, frequency: "MONTHLY" }, _sum: { amount: true } }),
      prisma.inventory.findMany({
        where: { shopId },
        include: { product: { select: { id: true, name: true, category: true, unit: true, sellingPrice: true, active: true } } },
        orderBy: { product: { name: "asc" } },
      }),
    ]);

    const totalPurchases = purchases._sum.totalCost ?? 0;
    const totalSales = sales._sum.totalAmount ?? 0;
    const totalDailyExpenses = dailyExpenses._sum.amount ?? 0;
    const totalMonthlyExpenses = monthlyExpenses._sum.amount ?? 0;
    const currentBalance = shop.openingBalance + totalSales - totalPurchases - totalDailyExpenses - totalMonthlyExpenses;

    return res.json({
      success: true,
      shop: {
        id: shop.id,
        name: shop.name,
        location: shop.location,
        openingBalance: shop.openingBalance,
        active: shop.active,
      },
      financialSummary: {
        openingBalance: shop.openingBalance,
        totalSales,
        totalPurchases,
        totalDailyExpenses,
        totalMonthlyExpenses,
        currentBalance,
      },
      inventory: inventory.map((item) => ({
        id: item.id,
        productId: item.product.id,
        productName: item.product.name,
        category: item.product.category,
        unit: item.product.unit,
        sellingPrice: item.product.sellingPrice,
        quantity: item.quantity,
        active: item.product.active,
      })),
    });
  } catch (error) {
    console.error("Fetching shop summary failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch shop summary" });
  }
});

export default router;
