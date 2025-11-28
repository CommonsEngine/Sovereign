import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "$/services/database.js";
import * as shares from "$/handlers/projects/shares.js";

function buildRes() {
  return {
    statusCode: 200,
    payload: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function stubOwnerAccess(projectId, userId = "u_owner") {
  const originalProjectFindUnique = prisma.project.findUnique;
  const originalContributorFindFirst = prisma.projectContributor.findFirst;

  prisma.project.findUnique = async ({ where }) => {
    if (where?.id !== projectId) return null;
    return { id: projectId, type: "blog" };
  };

  prisma.projectContributor.findFirst = async ({ where }) => {
    if (!where || where.projectId !== projectId) return null;

    const matchesOwnerRole =
      (!("role" in where) || where.role === "owner") &&
      (!("status" in where) || where.status === "active");

    const orConditions = Array.isArray(where.OR) ? where.OR : [];
    const matchesCurrentUser = orConditions.some((cond) => cond?.userId === userId);

    if (matchesCurrentUser || matchesOwnerRole) {
      return {
        id: "pc_owner",
        projectId,
        userId,
        role: "owner",
        status: "active",
      };
    }

    return null;
  };

  return () => {
    prisma.project.findUnique = originalProjectFindUnique;
    prisma.projectContributor.findFirst = originalContributorFindFirst;
  };
}

test("create issues owner invite and syncs primary owner", async (t) => {
  const projectId = "p_123";
  const restoreAccess = stubOwnerAccess(projectId);

  const req = {
    params: { id: projectId },
    user: { id: "u_owner", email: "owner@example.com" },
    body: { role: "owner", email: "invitee@example.com" },
  };
  const res = buildRes();

  const txFindFirstCalls = [];
  const txCreateCalls = [];
  const tx = {
    user: {
      async findUnique() {
        return null;
      },
    },
    userEmail: {
      async findUnique() {
        return null;
      },
    },
    projectContributor: {
      async findFirst(args) {
        txFindFirstCalls.push(args);
        // existing member lookup should return null,
        // sync primary owner lookup should return owner.
        if (args?.where?.role === "owner") {
          return { userId: "u_owner" };
        }
        return null;
      },
      async create(args) {
        txCreateCalls.push(args);
        return {
          id: "pm_123",
          projectId,
          userId: null,
          invitedEmail: args.data.invitedEmail,
          role: args.data.role,
          status: args.data.status,
          invitedAt: new Date(),
          acceptedAt: null,
          note: null,
          user: null,
        };
      },
    },
  };

  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (fn) => fn(tx);

  try {
    await shares.create(req, res);
  } finally {
    prisma.$transaction = originalTransaction;
    restoreAccess();
  }

  assert.equal(res.statusCode, 201);
  assert.ok(res.payload?.member);
  assert.equal(res.payload.member.email, "invitee@example.com");
  assert.equal(res.payload.member.status, "pending");
  assert.equal(txCreateCalls.length, 1);
  const syncCall = txFindFirstCalls.find((call) => call?.where?.role === "owner");
  assert.ok(syncCall, "expected syncProjectPrimaryOwner to search for owners");
});

test("update prevents removing last active owner", async (t) => {
  const projectId = "p_456";
  const memberId = "pm_456";
  const restoreAccess = stubOwnerAccess(projectId);

  const req = {
    params: { id: projectId, memberId },
    user: { id: "u_owner" },
    body: { role: "viewer" },
  };
  const res = buildRes();

  const txUpdateCalls = [];
  const tx = {
    projectContributor: {
      async findUnique({ where }) {
        assert.equal(where?.id, memberId);
        return {
          id: memberId,
          projectId,
          role: "owner",
          status: "active",
          acceptedAt: new Date(),
          userId: "u_owner",
        };
      },
      async count() {
        return 0; // force ensureAnotherActiveOwner to throw
      },
      async update(args) {
        txUpdateCalls.push(args);
        return args.data;
      },
    },
  };

  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (fn) => fn(tx);

  try {
    await shares.update(req, res);
  } finally {
    prisma.$transaction = originalTransaction;
    restoreAccess();
  }

  assert.equal(res.statusCode, 400);
  assert.ok(
    res.payload?.error?.includes("At least one active owner"),
    "expected ownership guard error"
  );
  assert.equal(txUpdateCalls.length, 0);
});

test("remove deletes contributor and syncs owners", async (t) => {
  const projectId = "p_789";
  const memberId = "pm_789";
  const restoreAccess = stubOwnerAccess(projectId);

  const req = {
    params: { id: projectId, memberId },
    user: { id: "u_owner" },
  };
  const res = buildRes();

  const txFindFirstCalls = [];
  const deleteCalls = [];
  const tx = {
    projectContributor: {
      async findUnique({ where }) {
        assert.equal(where?.id, memberId);
        return {
          projectId,
          role: "viewer",
          status: "active",
        };
      },
      async count() {
        return 1;
      },
      async delete(args) {
        deleteCalls.push(args);
      },
      async findFirst(args) {
        txFindFirstCalls.push(args);
        if (args?.where?.role === "owner") {
          return { userId: "u_owner" };
        }
        return null;
      },
    },
  };

  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (fn) => fn(tx);

  try {
    await shares.remove(req, res);
  } finally {
    prisma.$transaction = originalTransaction;
    restoreAccess();
  }

  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].where.id, memberId);
  const syncCall = txFindFirstCalls.find((call) => call?.where?.role === "owner");
  assert.ok(syncCall, "expected owner sync lookup after removal");
});
