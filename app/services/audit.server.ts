import type { AuditAction, Prisma } from "@prisma/client";
import prisma from "../db.server";

export function logAudit(input: {
  shopId: string;
  actor: string;
  action: AuditAction;
  experimentId?: string | null;
  diff?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      shopId: input.shopId,
      actor: input.actor,
      action: input.action,
      experimentId: input.experimentId ?? null,
      diff: input.diff,
    },
  });
}
