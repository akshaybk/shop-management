import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const hasShopAccess = async (user, shopId) => {
  if (user.role === "SUPER_MANAGER") return true;

  if (user.role !== "MANAGER" && user.role !== "SHAREHOLDER") return false;

  if (user.role === "MANAGER") {
    const assignment = await prisma.managerShop.findUnique({
      where: {
        managerId_shopId: {
          managerId: user.userId,
          shopId,
        },
      },
    });

    return Boolean(assignment);
  }

  const assignment = await prisma.shareholderShop.findUnique({
    where: {
      shareholderId_shopId: {
        shareholderId: user.userId,
        shopId,
      },
    },
  });

  return Boolean(assignment);
};

router.get("/:shopId", async (req, res) => {
  try {
    const shopId = parsePositiveInt(req.params.shopId);

    if (!shopId) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop id",
      });
    }

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    if (!await hasShopAccess(req.user, shopId)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this shop",
      });
    }

    const inventory = await prisma.inventory.findMany({
      where: { shopId },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
    });

    return res.json({
      success: true,
      shop: {
        id: shop.id,
        name: shop.name,
        location: shop.location,
      },
      inventory: inventory.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        category: item.product.category,
        unit: item.product.unit,
        sellingPrice: item.product.sellingPrice,
        quantity: item.quantity,
        updatedAt: item.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Listing inventory failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch inventory",
    });
  }
});

router.get("/purchases/:shopId", async (req, res) => {
  try {
    const shopId = parsePositiveInt(req.params.shopId);

    if (!shopId) {
      return res.status(400).json({ success: false, message: "Invalid shop id" });
    }

    if (!await hasShopAccess(req.user, shopId)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this shop",
      });
    }

    const purchases = await prisma.stockPurchase.findMany({
      where: { shopId },
      include: {
        product: { select: { id: true, name: true, unit: true } },
        createdBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { purchasedAt: "desc" },
      take: 50,
    });

    return res.json({ success: true, purchases });
  } catch (error) {
    console.error("Listing purchases failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch purchase history",
    });
  }
});

router.post(
  "/purchase",
  authorizeRoles("SUPER_MANAGER", "MANAGER"),
  async (req, res) => {
    try {
      const shopId = parsePositiveInt(req.body.shopId);
      const productId = parsePositiveInt(req.body.productId);
      const quantity = parsePositiveInt(req.body.quantity);
      const unitCost = Number(req.body.unitCost);

      if (!shopId || !productId || !quantity) {
        return res.status(400).json({
          success: false,
          message: "Valid shopId, productId, and positive quantity are required",
        });
      }

      if (!Number.isFinite(unitCost) || unitCost < 0) {
        return res.status(400).json({
          success: false,
          message: "Unit cost must be a non-negative number",
        });
      }

      const [shop, product] = await Promise.all([
        prisma.shop.findUnique({ where: { id: shopId } }),
        prisma.product.findUnique({ where: { id: productId } }),
      ]);

      if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });
      if (!shop.active) return res.status(400).json({ success: false, message: "Cannot purchase stock for an inactive shop" });
      if (!product) return res.status(404).json({ success: false, message: "Product not found" });
      if (!product.active) return res.status(400).json({ success: false, message: "Cannot purchase an inactive product" });

      if (!await hasShopAccess(req.user, shopId)) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this shop",
        });
      }

      const totalCost = quantity * unitCost;

      const result = await prisma.$transaction(async (tx) => {
        const inventory = await tx.inventory.upsert({
          where: { shopId_productId: { shopId, productId } },
          update: { quantity: { increment: quantity } },
          create: { shopId, productId, quantity },
          include: { product: true },
        });

        const purchase = await tx.stockPurchase.create({
          data: {
            shopId,
            productId,
            quantity,
            unitCost,
            totalCost,
            createdById: req.user.userId,
          },
        });

        return { inventory, purchase };
      });

      return res.status(201).json({
        success: true,
        message: "Stock purchased successfully",
        purchase: {
          id: result.purchase.id,
          shopId: result.purchase.shopId,
          productId: result.purchase.productId,
          quantity: result.purchase.quantity,
          unitCost: result.purchase.unitCost,
          totalCost: result.purchase.totalCost,
          purchasedAt: result.purchase.purchasedAt,
        },
        inventory: {
          productId: result.inventory.productId,
          productName: result.inventory.product.name,
          quantity: result.inventory.quantity,
          unit: result.inventory.product.unit,
        },
      });
    } catch (error) {
      console.error("Purchasing stock failed:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to purchase stock",
      });
    }
  },
);

export default router;
