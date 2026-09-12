import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

const moneyFields = { totalAmount: true };

router.get("/dashboard", async (req, res) => {
  try {
    if (req.user.role !== "SHAREHOLDER") {
      return res.status(403).json({ success: false, message: "Shareholder access required" });
    }

    const assignments = await prisma.shareholderShop.findMany({
      where: { shareholderId: Number(req.user.userId), shop: { active: true } },
      include: { shop: true },
      orderBy: { shopId: "asc" },
    });

    const shops = await Promise.all(assignments.map(async (assignment) => {
      const shopId = assignment.shopId;
      const [sales, purchases, expenses, inventory] = await Promise.all([
        prisma.sale.aggregate({ where: { shopId }, _sum: moneyFields }),
        prisma.stockPurchase.aggregate({ where: { shopId }, _sum: { totalCost: true } }),
        prisma.expense.aggregate({ where: { shopId }, _sum: { amount: true } }),
        prisma.inventory.findMany({ where: { shopId }, include: { product: true }, orderBy: { product: { name: "asc" } } }),
      ]);

      const totalSales = sales._sum.totalAmount ?? 0;
      const totalPurchases = purchases._sum.totalCost ?? 0;
      const totalExpenses = expenses._sum.amount ?? 0;
      const currentBalance = assignment.shop.openingBalance + totalSales - totalPurchases - totalExpenses;

      return {
        shop: { id: assignment.shop.id, name: assignment.shop.name, location: assignment.shop.location },
        stakePercentage: assignment.stakePercentage,
        financial: { currentBalance, totalSales, totalPurchases, totalExpenses },
        inventory: inventory.map((item) => ({ productId: item.productId, productName: item.product.name, unit: item.product.unit, quantity: item.quantity, sellingPrice: item.product.sellingPrice, lowStock: item.quantity <= 10 })),
      };
    }));

    return res.json({ success: true, data: { shops } });
  } catch (error) {
    console.error("Shareholder dashboard failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load shareholder dashboard" });
  }
});

export default router;
