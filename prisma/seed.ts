// Creates the first TPO admin from env. Idempotent. Forced password change on first login.
import { db, inTx, SYSTEM } from "../src/infrastructure/db.js";
import { hashPassword } from "../src/infrastructure/password.js";
import { userMachine } from "../src/modules/auth/auth.service.js";

const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password) throw new Error("set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD");

if (await db.user.findUnique({ where: { email } })) console.log(`admin ${email} already exists`);
else {
  const password_hash = await hashPassword(password);
  await inTx((tx) =>
    userMachine.create(tx, { role: "admin", email, name: "Training & Placement Officer", password_hash, must_change_password: true, email_verified_at: new Date() }, SYSTEM, {
      state: "active",
      meta: { via: "seed" },
    }),
  );
  console.log(`created admin ${email}`);
}
await db.$disconnect();
