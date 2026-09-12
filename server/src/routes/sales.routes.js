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
    const productId = Number(req.body.productId);
    const quantity = Number(req.body.quantity);

    if (![shopId, productId].every((value) => Number.isInteger(value) && value > 0)) {
      return res.status(400).json({
        success: false,
        message: "Valid shopId and productId are required",
      });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive whole number",
      });
    }

    if (!(await canAccessShop(req.user, shopId))) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this shop",
      });
    }

    const [shop, product, inventory] = await Promise.all([
      prisma.shop.findUnique({ where: { id: shopId } }),
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.inventory.findUnique({
        where: { shopId_productId: { shopId, productId } },
      }),
    ]);

    if (!shop || !shop.active) {
      return res.status(404).json({ success: false, message: "Active shop not found" });
    }

    if (!product || !product.active) {
      return res.status(404).json({ success: false, message: "Active product not found" });
    }

    if (!inventory || inventory.quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock",
        availableQuantity: inventory?.quantity ?? 0,
      });
    }

    const unitSellingPrice = product.sellingPrice;
    const totalAmount = quantity * unitSellingPrice;

    const result = await prisma.$transaction(async (tx) => {
      const currentInventory = await tx.inventory.findUnique({
        where: { shopId_productId: { shopId, productId } },
      });

      if (!currentInventory || currentInventory.quantity < quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const sale = await tx.sale.create({
        data: {
          shopId,
          productId,
          quantity,
          unitSellingPrice,
          totalAmount,
          createdById: req.user.userId,
        },
      });

      const updatedInventory = await tx.inventory.update({
        where: { shopId_productId: { shopId, productId } },
        data: { quantity: { decrement: quantity } },
      });

      return { sale, updatedInventory };
    });

    return res.status(201).json({
      success: true,
      message: "Sale recorded successfully",
      sale: result.sale,
      inventory: {
        productId,
        quantity: result.updatedInventory.quantity,
      },
    });
  } catch (error) {
    if (error.message === "INSUFFICIENT_STOCK") {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock",
      });
    }

    console.error("Creating sale failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to record sale",
    });
  }
});

router.get("/shop/:shopId", async (req, res) => {
  try {
    const shopId = Number(req.params.shopId);

    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid shop id" });
    }

    if (!(await canAccessShop(req.user, shopId))) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this shop",
      });
    }

    const sales = await prisma.sale.findMany({
      where: { shopId },
      include: {
        product: { select: { id: true, name: true, unit: true } },
        createdBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { soldAt: "desc" },
    });

    return res.json({ success: true, sales });
  } catch (error) {
    console.error("Listing sales failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch sales",
    });
  }
});

export default router;
