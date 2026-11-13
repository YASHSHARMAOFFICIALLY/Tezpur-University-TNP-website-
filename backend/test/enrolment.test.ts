// Enrolment number decides branch and batch: ECB24001 = programme ECB, admitted 2024, finishing 2024 + programme years (default 4).
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/infrastructure/db.js";
import { api, app, as, freshDbWithAdmin } from "./helpers.js";

const register = (enrol: string, programme_id?: string) =>
  request(app)
    .post(api("/auth/register/student"))
    .send({ email: `${enrol.toLowerCase()}@tezu.ac.in`, password: "student-pass", name: "Enrol Test", enrolment_no: enrol, mobile: "9876543210", programme_id });
const student = (enrol: string) => db.student.findUniqueOrThrow({ where: { enrolment_no: enrol }, include: { programme: true } });

describe("enrolment number -> programme and batch", () => {
  let admin: ReturnType<typeof as>;
  let csb: string;
  beforeAll(async () => {
    admin = await freshDbWithAdmin();
    await admin.post("/admin/programmes", { department: "School of Engineering", name: "B.Tech ECE", code: "ECB", year: 4 }).expect(201);
    await admin.post("/admin/programmes", { department: "School of Engineering", name: "M.Tech CSE", code: "CSM", year: 2 }).expect(201);
    csb = (await admin.post("/admin/programmes", { department: "School of Engineering", name: "B.Tech CSE", code: "CSB" }).expect(201)).body.id;
  });

  it("ecb24 goes to ECB, batch 2024-2028, even if the form picked another programme", async () => {
    expect((await register("ecb24001", csb)).status).toBe(201);
    const s = await student("ECB24001");
    expect([s.programme?.code, s.year_of_admission, s.year_of_completion]).toEqual(["ECB", 2024, 2028]);
  });

  it("programme length comes from the programme (2-year M.Tech)", async () => {
    await register("CSM25003").expect(201);
    const s = await student("CSM25003");
    expect([s.programme?.code, s.year_of_admission, s.year_of_completion]).toEqual(["CSM", 2025, 2027]);
  });

  it("unknown code (meb25): batch is still set; adding programme MEB later links the student", async () => {
    await register("MEB25001").expect(201);
    let s = await student("MEB25001");
    expect([s.programme_id, s.year_of_admission, s.year_of_completion]).toEqual([null, 2025, 2029]);
    await admin.post("/admin/programmes", { department: "School of Engineering", name: "B.Tech ME", code: "MEB", year: 4 }).expect(201);
    s = await student("MEB25001");
    expect(s.programme?.code).toBe("MEB");
  });

  it("digits that would be a future year are not a batch: nothing derived", async () => {
    await register("ECB99001").expect(201);
    const s = await student("ECB99001");
    expect([s.programme_id, s.year_of_admission, s.year_of_completion]).toEqual([null, null, null]);
  });
});
