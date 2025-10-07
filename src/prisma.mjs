import { PrismaClient } from "@prisma/client";

import logger from "./utils/logger.mjs";

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});
export default prisma;

// Handle Prisma connection errors and graceful shutdown
async function connectPrisma() {
  try {
    await prisma.$connect();
    logger.log("Connected to the database.");
  } catch (err) {
    logger.error("Failed to connect to the database:", err);
    process.exit(1);
  }
}

// Helper to wait for a given number of milliseconds
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry logic for connecting to Prisma
export async function connectPrismaWithRetry(maxRetries = 5, delayMs = 2000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await connectPrisma();
      return;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        logger.error(
          `Failed to connect to the database after ${maxRetries} attempts. Exiting.`,
        );
        process.exit(1);
      }
      logger.warn(
        `Database connection failed (attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms...`,
        err,
      );
      await sleep(delayMs);
    }
  }
}

// Graceful shutdown
export async function gracefulShutdown(signal) {
  logger.log(`Received ${signal}. Closing database connection...`);
  try {
    await prisma.$disconnect();
    logger.log("Database connection closed.");
  } catch (err) {
    logger.error("Error during disconnect:", err);
  } finally {
    process.exit(0);
  }
}
