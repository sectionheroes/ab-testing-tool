// pnpm seed:admin <email>  – upserts a dashboard user with role ADMIN. Script, not a migration (plan WP1).
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("usage: pnpm seed:admin <email>");
  process.exit(1);
}

const prisma = new PrismaClient();
const user = await prisma.user.upsert({
  where: { email },
  update: { role: "ADMIN" },
  create: { email, role: "ADMIN" },
});
console.log(`ADMIN: ${user.email} (${user.id})`);
await prisma.$disconnect();
