import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";

const router = Router();
router.use(authenticate, authorizeRoles("SUPER_MANAGER"));

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

router.post("/", async (req, res) => {
  try {
    const shopId = parsePositiveInt(req.body.shopId);
    const productId = parsePositiveInt(req.body.productId);
    const quantityChange = Number(req.body.quantityChange);
    const reason = req.body.reason?.trim();

    if (!shopId || !productId) {
      return res.status(400).json({ success: false, message: "Valid shopId and productId are required" });
    }
    if (!Number.isInteger(quantityChange) || quantityChange === 0) {
      return res.status(400).json({ success: false, message: "quantityChange must be a non-zero integer" });
    }
    if (!reason) {
      return res.status(400).json({ success: false, message: "Adjustment reason is required" });
    }

    const [shop, product] = await Promise.all([
      prisma.shop.findUnique({ where: { id: shopId } }),
      prisma.product.findUnique({ where: { id: productId } }),
    ]);

    if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });
    if (!shop.active) return res.status(400).json({ success: false, message: "Cannot adjust stock for an inactive shop" });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    if (!product.active) return res.status(400).json({ success: false, message: "Cannot adjust stock for an inactive product" });

    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: { shopId_productId: { shopId, productId } },
      });

      const currentQuantity = inventory?.quantity ?? 0;
      const newQuantity = currentQuantity + quantityChange;

      if (newQuantity < 0) {
        const error = new Error("Adjustment would make stock negative");
        error.code = "NEGATIVE_STOCK";
        error.availableQuantity = currentQuantity;
        throw error;
      }

      const updatedInventory = await tx.inventory.upsert({
        where: { shopId_productId: { shopId, productId } },
        update: { quantity: { increment: quantityChange } },
        create: { shopId, productId, quantity: quantityChange },
        include: { product: true },
      });

      const adjustment = await tx.stockAdjustment.create({
        data: {
          shopId,
          productId,
          quantityChange,
          reason,
          createdById: req.user.userId,
        },
      });

      return { adjustment, inventory: updatedInventory };
    });

    return res.status(201).json({
      success: true,
      message: "Stock adjusted successfully",
      adjustment: result.adjustment,
      inventory: {
        productId: result.inventory.productId,
        productName: result.inventory.product.name,
        quantity: result.inventory.quantity,
        unit: result.inventory.product.unit,
      },
    });
  } catch (error) {
    if (error.code === "NEGATIVE_STOCK") {
      return res.status(400).json({
        success: false,
        message: error.message,
        availableQuantity: error.availableQuantity,
      });
    }

    console.error("Adjusting stock failed:", error);
    return res.status(500).json({ success: false, message: "Unable to adjust stock" });
  }
});

router.get("/shop/:shopId", async (req, res) => {
  try {
    const shopId = parsePositiveInt(req.params.shopId);
    if (!shopId) return res.status(400).json({ success: false, message: "Invalid shop id" });

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });

    const adjustments = await prisma.stockAdjustment.findMany({
      where: { shopId },
      include: {
        product: { select: { id: true, name: true, unit: true } },
        createdBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { adjustedAt: "desc" },
    });

    return res.json({ success: true, adjustments });
  } catch (error) {
    console.error("Listing stock adjustments failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch stock adjustments" });
  }
});

export default router;
