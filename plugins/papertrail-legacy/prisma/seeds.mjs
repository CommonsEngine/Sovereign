import { PrismaClient } from "@prisma/client";

let sharedClient;

export async function seed({ prisma } = {}) {
  const client = prisma || sharedClient || new PrismaClient();
  sharedClient = client;

  try {
    // Papertrail legacy plugin does not require data seeds yet.
    console.log("ℹ️  papertrail-legacy: no seed data defined.");
  } finally {
    if (!prisma) {
      await client.$disconnect();
      sharedClient = null;
    }
  }
}
