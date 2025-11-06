import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function seed() {
  await prisma.FlowMapper.upsert({
    where: { id: "seed-1" },
    update: {},
    create: { id: "seed-1", title: "Hello", content: "Placeholder content" },
  });
}
