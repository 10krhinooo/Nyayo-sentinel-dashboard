import { Router } from "express";
import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles } from "../middleware/auth";
import { audit } from "../middleware/audit";

const router = Router();

const adminOnly = [authenticate(true), requireRoles([UserRole.NATIONAL_ADMIN])];

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole),
  countyId: z.string().optional(),
});

const updateUserSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  countyId: z.string().nullable().optional(),
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
          role: true,
          countyId: true,
          mfaEnabled: true,
          createdAt: true,
          county: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      return res.json({ users });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// POST /users
router.post(
  "/",
  ...adminOnly,
  audit("CREATE_USER", "USER"),
  async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }
    const { email, password, role, countyId } = parsed.data;

    if (role === UserRole.COUNTY_OFFICIAL && !countyId) {
      return res.status(400).json({ message: "County officials must be assigned a county." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "A user with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role,
          countyId: countyId ?? null,
          mfaEnabled: false,
        },
        select: { id: true, email: true, role: true, countyId: true, createdAt: true },
      });
      return res.status(201).json({ user });
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

    const { role, countyId } = parsed.data;

    try {
      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(role !== undefined ? { role } : {}),
          ...(countyId !== undefined ? { countyId } : {}),
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
