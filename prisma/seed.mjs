import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clean in FK-safe order
  await prisma.postMeta.deleteMany();
  await prisma.projectCmsgit.deleteMany();
  await prisma.projectCanvasGraph.deleteMany();
  await prisma.projectWorkspace.deleteMany();
  await prisma.session?.deleteMany().catch(() => {});
  await prisma.verificationToken?.deleteMany().catch(() => {});
  await prisma.passwordResetToken?.deleteMany().catch(() => {});
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // Precomputed bcrypt hash for password "admin123"
  // Change if needed (or compute at runtime).
  const passwordHash =
    "$2b$10$mbwm5mrZZF1iWOPZgHl5eu06KcTKzaBRXaQwtYEK7DZL5PWplSg2W";

  // Users (schema: username, email, passwordHash, ...)
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      username: "admin",
      email: "admin@example.com",
      passwordHash,
    },
  });

  const editor = await prisma.user.upsert({
    where: { email: "editor@example.com" },
    update: {},
    create: {
      username: "editor",
      email: "editor@example.com",
      passwordHash,
    },
  });

  // Project: CMS Git
  const gp = await prisma.project.create({
    data: {
      name: "Sovereign Demo",
      des: "Public demo project seeded by prisma/seed.mjs",
      type: "cmsgit",
      scope: "public",
      status: "published",
      owner: { connect: { id: admin.id } },
      admins: { connect: [{ id: admin.id }] },
      editors: { connect: [{ id: editor.id }] },
    },
  });

  await prisma.projectCmsgit.create({
    data: {
      projectId: gp.id,
      repoUrl: "https://github.com/example/sovereign-demo-content",
      defaultBranch: "main",
      contentDir: "src/content/blog",
      provider: "github",
      authType: "ssh",
      // authSecret: null,
    },
  });

  await prisma.postMeta.createMany({
    data: [
      {
        cmsgitId: gp.id, // references ProjectCmsgit.projectId
        path: "src/content/blog/index.md",
        title: "Welcome to Sovereign Demo",
        excerpt: "A public demo project visible to all users.",
        pubDate: new Date(),
        draft: false,
        tags: "demo,intro",
      },
      {
        cmsgitId: gp.id,
        path: "src/content/blog/getting-started.md",
        title: "Getting Started",
        excerpt: "How to use this demo project.",
        pubDate: new Date(),
        draft: true,
        tags: "guide",
      },
    ],
  });

  // Project: Canvas Graph
  const canvas = await prisma.project.create({
    data: {
      name: "Canvas Playground",
      des: "A canvas-based experiment",
      type: "canvasgraph",
      scope: "private",
      status: "draft",
      owner: { connect: { id: admin.id } },
    },
  });

  await prisma.projectCanvasGraph.create({
    data: {
      projectId: canvas.id,
      width: 1280,
      height: 800,
      bgColor: "#ffffff",
    },
  });

  // Project: Workspace
  const ws = await prisma.project.create({
    data: {
      name: "Workspace Sandbox",
      des: "General workspace",
      type: "workspace",
      scope: "private",
      status: "draft",
      owner: { connect: { id: editor.id } },
    },
  });

  await prisma.projectWorkspace.create({
    data: {
      projectId: ws.id,
      // rootPath, notes are not in current schema; keeping minimal
    },
  });

  console.log("Seed completed.");
}

(async () => {
  try {
    await main();
  } catch (e) {
    console.error("Seed failed:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
