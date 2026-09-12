import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";
import authRouter from "./routes/auth.routes.js";
import usersRouter from "./routes/users.routes.js";
import shopsRouter from "./routes/shops.routes.js";
import productsRouter from "./routes/products.routes.js";
import inventoryRouter from "./routes/inventory.routes.js";
import salesRouter from "./routes/sales.routes.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      message: "Shop Management API is running",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(503).json({
      success: false,
      message: "Shop Management API is running, but the database is unavailable",
      database: "disconnected",
    });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/shops", shopsRouter);
app.use("/api/products", productsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/sales", salesRouter);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down server...`);

  server.close(async () => {
    await prisma.$disconnect();
    console.log("Server stopped.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
