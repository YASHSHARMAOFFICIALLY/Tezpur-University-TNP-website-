// Sign-in and route guards for all three roles, at desktop and phone width.
// usage: webctl journey .claude/skills/verify-tnp-web/journeys/sign-in.mjs [--headed]
import { ADMIN, PW, RECRUITER, SEED_STUDENT, WEB, browser, login, newPage, step, summary } from "../../../../scripts/e2e-lib.mjs";

const ART = process.env.ARTIFACTS;
const shot = (page, name) => page.screenshot({ path: `${ART}/sign-in-${name}.png`, fullPage: true });
const noOverflow = async (page, where) => {
  await page.waitForLoadState("networkidle"); // SSR markup is in the DOM before its CSS applies; measuring earlier sees unstyled widths
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > page.viewportSize().width) throw new Error(`${where}: horizontal overflow, scrollWidth ${sw}`);
};
const ROLES = [
  ["admin", ADMIN, /\/admin$/, "TPO Administrative Control Center"],
  ["student", SEED_STUDENT, /\/student$/, null],
  ["recruiter", RECRUITER, /\/recruiter$/, "Cognizant Technology Solutions"],
];

const guest = await newPage();
await step("wrong password shows the backend error and stays on /login", async () => {
  await login(guest, ADMIN, "definitely-wrong");
  await guest.getByRole("alert").filter({ hasText: "Email or password is wrong" }).waitFor();
  if (!/\/login$/.test(guest.url())) throw new Error(`left /login: ${guest.url()}`);
  await shot(guest, "wrong-password");
});
for (const path of ["/admin", "/student", "/recruiter", "/admin/system"]) {
  await step(`guest opening ${path} is sent to /login`, async () => {
    await guest.goto(`${WEB}${path}`);
    await guest.waitForURL(/\/login$/);
  });
}
await step("login page fits a 390px phone without horizontal scroll", async () => {
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.goto(`${WEB}/login`);
  await guest.getByRole("button", { name: "Sign in" }).waitFor();
  await noOverflow(guest, "/login");
  await shot(guest, "login-390");
});

for (const [role, email, home, marker] of ROLES) {
  const page = await newPage();
  await step(`${role} signs in and lands on its portal`, async () => {
    await login(page, email, PW);
    await page.waitForURL(home);
    if (marker) await page.getByText(marker).first().waitFor();
    await page.getByRole("button", { name: "Log out" }).waitFor();
    await shot(page, `${role}-home`);
  });
  await step(`${role} portal fits a 390px phone without horizontal scroll`, async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole("button", { name: "Log out" }).waitFor();
    await noOverflow(page, `${role} home`);
    await shot(page, `${role}-390`);
    await page.setViewportSize({ width: 1280, height: 900 });
  });
  if (role !== "admin") {
    await step(`${role} opening /admin/system is sent back to ${home.source}`, async () => {
      await page.goto(`${WEB}/admin/system`);
      await page.waitForURL(home);
    });
  }
  await step(`${role} logs out; Back does not reopen the portal`, async () => {
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL(/\/login$/);
    await page.goBack({ waitUntil: "commit" }).catch(() => {});
    await page.waitForTimeout(1500);
    if (home.test(page.url()) || (await page.getByRole("button", { name: "Log out" }).isVisible()))
      throw new Error(`Back reopened a signed-in view: ${page.url()}`);
  });
}

await browser.close();
summary();
