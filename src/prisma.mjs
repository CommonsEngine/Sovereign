import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});
export default prisma;

// Handle Prisma connection errors and graceful shutdown
async function connectPrisma() {
  try {
    await prisma.$connect();
    console.log("Connected to the database.");
  } catch (err) {
    console.error("Failed to connect to the database:", err);
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
        console.error(
          `Failed to connect to the database after ${maxRetries} attempts. Exiting.`,
        );
        process.exit(1);
      }
      console.warn(
        `Database connection failed (attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms...`,
        err,
      );
      await sleep(delayMs);
    }
  }
}

// Graceful shutdown
export async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Closing database connection...`);
  try {
    await prisma.$disconnect();
    console.log("Database connection closed.");
  } catch (err) {
    console.error("Error during disconnect:", err);
  } finally {
    process.exit(0);
  }
}
