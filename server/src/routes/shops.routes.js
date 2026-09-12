import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, authorizeRoles("SUPER_MANAGER"));

const shopSummary = (shop) => ({
  id: shop.id,
  name: shop.name,
  location: shop.location,
  openingBalance: shop.openingBalance,
  active: shop.active,
  createdAt: shop.createdAt,
  updatedAt: shop.updatedAt,
  managers: shop.managers.map(({ manager }) => ({
    id: manager.id,
    name: manager.name,
    email: manager.email,
    active: manager.active,
  })),
  shareholders: shop.shareholders.map(({ shareholder, stakePercentage }) => ({
    id: shareholder.id,
    name: shareholder.name,
    email: shareholder.email,
    active: shareholder.active,
    stakePercentage,
  })),
});

const getShop = (id) => prisma.shop.findUnique({
  where: { id },
  include: {
    managers: { include: { manager: true } },
    shareholders: { include: { shareholder: true } },
  },
});

router.get("/", async (_req, res) => {
  try {
    const shops = await prisma.shop.findMany({
      include: {
        managers: { include: { manager: true } },
        shareholders: { include: { shareholder: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      shops: shops.map(shopSummary),
    });
  } catch (error) {
    console.error("Listing shops failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch shops",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, location, openingBalance } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Shop name is required",
      });
    }

    const parsedOpeningBalance = openingBalance === undefined ? 0 : Number(openingBalance);

    if (!Number.isFinite(parsedOpeningBalance) || parsedOpeningBalance < 0) {
      return res.status(400).json({
        success: false,
        message: "Opening balance must be a non-negative number",
      });
    }

    const shop = await prisma.shop.create({
      data: {
        name: name.trim(),
        location: location?.trim() || null,
        openingBalance: parsedOpeningBalance,
      },
      include: {
        managers: { include: { manager: true } },
        shareholders: { include: { shareholder: true } },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Shop created successfully",
      shop: shopSummary(shop),
    });
  } catch (error) {
    console.error("Creating shop failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create shop",
    });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid shop id" });
    }

    const { active } = req.body;

    if (typeof active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Active must be a boolean",
      });
    }

    const existingShop = await prisma.shop.findUnique({ where: { id } });

    if (!existingShop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    const shop = await prisma.shop.update({
      where: { id },
      data: { active },
      include: {
        managers: { include: { manager: true } },
        shareholders: { include: { shareholder: true } },
      },
    });

    return res.json({
      success: true,
      message: active ? "Shop activated" : "Shop deactivated",
      shop: shopSummary(shop),
    });
  } catch (error) {
    console.error("Updating shop status failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update shop status",
    });
  }
});

router.post("/:id/managers", async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    const managerId = Number(req.body.managerId);

    if (!Number.isInteger(shopId) || shopId <= 0 || !Number.isInteger(managerId) || managerId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid shopId and managerId are required",
      });
    }

    const [shop, manager] = await Promise.all([
      prisma.shop.findUnique({ where: { id: shopId } }),
      prisma.user.findUnique({ where: { id: managerId } }),
    ]);

    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    if (!manager || manager.role !== "MANAGER") {
      return res.status(404).json({ success: false, message: "Manager not found" });
    }

    await prisma.managerShop.upsert({
      where: { managerId_shopId: { managerId, shopId } },
      update: {},
      create: { managerId, shopId },
    });

    const updatedShop = await getShop(shopId);

    return res.status(201).json({
      success: true,
      message: "Manager assigned to shop",
      shop: shopSummary(updatedShop),
    });
  } catch (error) {
    console.error("Assigning manager failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to assign manager",
    });
  }
});

router.delete("/:id/managers/:managerId", async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    const managerId = Number(req.params.managerId);

    if (!Number.isInteger(shopId) || !Number.isInteger(managerId)) {
      return res.status(400).json({ success: false, message: "Invalid shop or manager id" });
    }

    await prisma.managerShop.delete({
      where: { managerId_shopId: { managerId, shopId } },
    });

    return res.json({ success: true, message: "Manager removed from shop" });
  } catch (error) {
    console.error("Removing manager failed:", error);
    return res.status(404).json({
      success: false,
      message: "Manager assignment not found",
    });
  }
});

router.post("/:id/shareholders", async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    const shareholderId = Number(req.body.shareholderId);
    const stakePercentage = req.body.stakePercentage === undefined
      ? null
      : Number(req.body.stakePercentage);

    if (!Number.isInteger(shopId) || shopId <= 0 || !Number.isInteger(shareholderId) || shareholderId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid shopId and shareholderId are required",
      });
    }

    if (stakePercentage !== null && (!Number.isFinite(stakePercentage) || stakePercentage < 0 || stakePercentage > 100)) {
      return res.status(400).json({
        success: false,
        message: "Stake percentage must be between 0 and 100",
      });
    }

    const [shop, shareholder] = await Promise.all([
      prisma.shop.findUnique({ where: { id: shopId } }),
      prisma.user.findUnique({ where: { id: shareholderId } }),
    ]);

    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    if (!shareholder || shareholder.role !== "SHAREHOLDER") {
      return res.status(404).json({ success: false, message: "Shareholder not found" });
    }

    await prisma.shareholderShop.upsert({
      where: { shareholderId_shopId: { shareholderId, shopId } },
      update: { stakePercentage },
      create: { shareholderId, shopId, stakePercentage },
    });

    const updatedShop = await getShop(shopId);

    return res.status(201).json({
      success: true,
      message: "Shareholder assigned to shop",
      shop: shopSummary(updatedShop),
    });
  } catch (error) {
    console.error("Assigning shareholder failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to assign shareholder",
    });
  }
});

router.delete("/:id/shareholders/:shareholderId", async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    const shareholderId = Number(req.params.shareholderId);

    if (!Number.isInteger(shopId) || !Number.isInteger(shareholderId)) {
      return res.status(400).json({ success: false, message: "Invalid shop or shareholder id" });
    }

    await prisma.shareholderShop.delete({
      where: { shareholderId_shopId: { shareholderId, shopId } },
    });

    return res.json({ success: true, message: "Shareholder removed from shop" });
  } catch (error) {
    console.error("Removing shareholder failed:", error);
    return res.status(404).json({
      success: false,
      message: "Shareholder assignment not found",
    });
  }
});

export default router;
