import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

const publicProduct = (product) => ({
  id: product.id,
  name: product.name,
  category: product.category,
  unit: product.unit,
  sellingPrice: product.sellingPrice,
  active: product.active,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});

router.get("/", async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { name: "asc" },
    });

    return res.json({
      success: true,
      products: products.map(publicProduct),
    });
  } catch (error) {
    console.error("Listing products failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch products",
    });
  }
});

router.post("/", authorizeRoles("SUPER_MANAGER"), async (req, res) => {
  try {
    const { name, category, unit, sellingPrice } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    const parsedSellingPrice = sellingPrice === undefined ? 0 : Number(sellingPrice);

    if (!Number.isFinite(parsedSellingPrice) || parsedSellingPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Selling price must be a non-negative number",
      });
    }

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        category: category?.trim() || null,
        unit: unit?.trim() || "piece",
        sellingPrice: parsedSellingPrice,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: publicProduct(product),
    });
  } catch (error) {
    console.error("Creating product failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create product",
    });
  }
});

router.patch("/:id", authorizeRoles("SUPER_MANAGER"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    const existingProduct = await prisma.product.findUnique({ where: { id } });

    if (!existingProduct) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const { name, category, unit, sellingPrice, active } = req.body;
    const data = {};

    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({ success: false, message: "Product name cannot be empty" });
      }
      data.name = name.trim();
    }

    if (category !== undefined) data.category = category?.trim() || null;
    if (unit !== undefined) {
      if (!unit?.trim()) {
        return res.status(400).json({ success: false, message: "Unit cannot be empty" });
      }
      data.unit = unit.trim();
    }

    if (sellingPrice !== undefined) {
      const parsedSellingPrice = Number(sellingPrice);
      if (!Number.isFinite(parsedSellingPrice) || parsedSellingPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Selling price must be a non-negative number",
        });
      }
      data.sellingPrice = parsedSellingPrice;
    }

    if (active !== undefined) {
      if (typeof active !== "boolean") {
        return res.status(400).json({ success: false, message: "Active must be a boolean" });
      }
      data.active = active;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: "No fields to update" });
    }

    const product = await prisma.product.update({
      where: { id },
      data,
    });

    return res.json({
      success: true,
      message: "Product updated successfully",
      product: publicProduct(product),
    });
  } catch (error) {
    console.error("Updating product failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update product",
    });
  }
});

export default router;
