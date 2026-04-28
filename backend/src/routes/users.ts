import { Router } from "express";
import { UserRole } from "@prisma/client";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles } from "../middleware/auth";
import { audit } from "../middleware/audit";
import { sendInviteEmail } from "../services/email";

const router = Router();

const adminOnly = [authenticate(true), requireRoles([UserRole.NATIONAL_ADMIN])];

const createUserSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  countyCode: z.string().optional(),
});

const updateUserSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  countyCode: z.string().nullable().optional(),
});

// GET /users
router.get(
  "/",
  ...adminOnly,
  audit("LIST_USERS", "USER"),
  async (_req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          countyId: true,
          mfaEnabled: true,
          mustSetPassword: true,
          createdAt: true,
          county: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      return res.json({ users });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// POST /users — creates user and sends invite email
router.post(
  "/",
  ...adminOnly,
  audit("CREATE_USER", "USER"),
  async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }
    const { email, role, countyCode } = parsed.data;

    if (role === UserRole.COUNTY_OFFICIAL && !countyCode) {
      return res.status(400).json({ message: "County officials must be assigned a county." });
    }

    let resolvedCountyId: string | null = null;
    if (countyCode) {
      const county = await prisma.county.findUnique({ where: { code: countyCode } });
      if (!county) {
        return res.status(400).json({ message: `County code "${countyCode}" not found.` });
      }
      resolvedCountyId = county.id;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "A user with that email already exists." });
    }

    const inviteToken = randomUUID();
    const inviteTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    try {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: "",
          role,
          countyId: resolvedCountyId,
          mfaEnabled: true,
          mustSetPassword: true,
          inviteToken,
          inviteTokenExpiry
        },
        select: { id: true, email: true, role: true, countyId: true, createdAt: true },
      });

      await sendInviteEmail(email, inviteToken);

      return res.status(201).json({ user, invited: true });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// PATCH /users/:id
router.patch(
  "/:id",
  ...adminOnly,
  audit("UPDATE_USER", "USER"),
  async (req, res) => {
    const { id } = req.params;

    if (id === req.user!.id) {
      return res.status(400).json({ message: "Cannot change your own role or county." });
    }

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }

    const { role, countyCode } = parsed.data;

    let resolvedCountyId: string | null | undefined;
    if (countyCode !== undefined) {
      if (countyCode === null) {
        resolvedCountyId = null;
      } else {
        const county = await prisma.county.findUnique({ where: { code: countyCode } });
        if (!county) {
          return res.status(400).json({ message: `County code "${countyCode}" not found.` });
        }
        resolvedCountyId = county.id;
      }
    }

    try {
      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(role !== undefined ? { role } : {}),
          ...(resolvedCountyId !== undefined ? { countyId: resolvedCountyId } : {}),
        },
        select: { id: true, email: true, role: true, countyId: true, county: { select: { name: true } } },
      });
      return res.json({ user });
    } catch {
      return res.status(404).json({ message: "User not found." });
    }
  }
);

// DELETE /users/:id
router.delete(
  "/:id",
  ...adminOnly,
  audit("DELETE_USER", "USER"),
  async (req, res) => {
    const { id } = req.params;

    if (id === req.user!.id) {
      return res.status(400).json({ message: "Cannot delete your own account." });
    }

    try {
      await prisma.user.delete({ where: { id } });
      return res.status(204).send();
    } catch {
      return res.status(404).json({ message: "User not found." });
    }
  }
);

export default router;
