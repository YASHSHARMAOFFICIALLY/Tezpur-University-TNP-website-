import { z } from "zod";

export const Email = z.email().max(200);
export const Password = z.string().min(8).max(200);
export const Otp = z.string().regex(/^\d{6}$/);
export const Role = z.enum(["admin", "student", "company"]);

export const Session = z
  .object({
    access_token: z.string(),
    refresh_token: z.string(),
    user: z.object({
      id: z.string(),
      role: Role,
      name: z.string(),
      email: z.string(),
      status: z.enum(["active", "alumni"]),
      must_change_password: z.boolean(),
    }),
  })
  .meta({ id: "Session" });
export const Pending = z.object({ status: z.enum(["pending_email_verify", "pending_admin"]) });

export const CompanyBody = z.object({
  name: z.string().min(2).max(200),
  postal_address: z.string().max(500).optional(),
  website: z.url().optional(),
  category: z.enum(["private", "mnc", "govt", "ngo", "psu", "startup", "other"]).optional(),
  sector: z.string().max(100).optional(),
});

export const RegisterStudentBody = z.object({
  email: Email, password: Password, name: z.string().min(2).max(200),
  enrolment_no: z.string().regex(/^[A-Za-z]{3}\d{5,6}$/, "e.g. CSB21001"),
  mobile: z.string().regex(/^\+?\d{10,13}$/), programme_id: z.uuid().optional(),
});
export const RegisterRecruiterBody = z.object({
  email: Email, password: Password, name: z.string().min(2).max(200), company: CompanyBody,
  contact: z.object({ designation: z.string().max(100).optional(), phone: z.string().max(20).optional(), mobile: z.string().max(20).optional() }).default({}),
});
export const VerifyOtpBody = z.object({ email: Email, code: Otp });
export const EmailBody = z.object({ email: Email });
export const LoginBody = z.object({ email: Email, password: z.string().max(200) });
export const RefreshBody = z.object({ refresh_token: z.string() });
export const ChangePasswordBody = z.object({ current_password: z.string(), new_password: Password });
export const ResetPasswordBody = z.object({ email: Email, code: Otp, new_password: Password });
export const ResubmitRecruiterBody = z.object({ email: Email, password: z.string(), company: CompanyBody.partial() });
export const Me = Session.shape.user.extend({ company_id: z.string().nullable() });
