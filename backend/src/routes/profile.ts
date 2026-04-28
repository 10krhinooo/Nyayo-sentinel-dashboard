import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { audit } from "../middleware/audit";
import { sendPasswordChangedEmail } from "../services/email";

const router = Router();

// GET /profile
router.get("/", authenticate(), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        countyId: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        county: { select: { name: true } }
      }
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

const updateProfileSchema = z.object({
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional()
});

// PATCH /profile
router.patch("/", authenticate(), audit("UPDATE_PROFILE", "USER"), async (req, res) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
    }
    const { firstName, lastName } = parsed.data;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {})
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, countyId: true }
    });
    return res.json({ user });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

// POST /profile/change-password
router.post("/change-password", authenticate(), audit("CHANGE_PASSWORD", "USER"), async (req, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    await sendPasswordChangedEmail(user.email);

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
