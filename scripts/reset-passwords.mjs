// Sets one password on existing accounts and revokes their sessions. Runs inside the app container (needs its DB env):
//   docker exec -i tnp-app-1 node --input-type=module - "$PW" a@x.com b@x.com < scripts/reset-passwords.mjs
const [pw, ...emails] = process.argv.slice(2);
if (!pw || pw.length < 8 || !emails.length) throw new Error("usage: <password min 8 chars> <email>...");
const { hashPassword } = await import("/app/dist/src/infrastructure/password.js");
const { db } = await import("/app/dist/src/infrastructure/db.js");
const password_hash = await hashPassword(pw);
for (const email of emails) {
  const r = await db.user.updateMany({
    where: { email: email.toLowerCase() },
    data: { password_hash, must_change_password: false, token_version: { increment: 1 } },
  });
  console.log(`${email}: ${r.count ? "reset" : "NOT FOUND"}`);
}
await db.$disconnect();
