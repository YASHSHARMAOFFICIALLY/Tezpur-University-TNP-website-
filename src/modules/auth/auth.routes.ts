import { Ok, route, type ModuleDef } from "../../http/route.js";
import {
  ChangePasswordBody, EmailBody, LoginBody, Me, Pending, RefreshBody, RegisterRecruiterBody, RegisterStudentBody,
  ResetPasswordBody, ResubmitRecruiterBody, Session, VerifyOtpBody,
} from "./auth.schemas.js";
import * as svc from "./auth.service.js";

const limited = { rateLimit: { perMinute: 10 } } as const;

export const authModule: ModuleDef = {
  name: "auth",
  routes: [
    route({
      method: "post", path: "/auth/register/student", summary: "Student self-registration (university email). Sends an OTP.",
      auth: "public", status: 201, ...limited,
      body: RegisterStudentBody,
      response: Pending,
      errors: ["EMAIL_DOMAIN_NOT_ALLOWED", "EMAIL_TAKEN", "ENROLMENT_TAKEN", "RATE_LIMITED"],
      handler: ({ body }) => svc.registerStudent(body),
    }),
    route({
      method: "post", path: "/auth/register/recruiter", summary: "Recruiter self-registration with organisation details. Sends an OTP.",
      auth: "public", status: 201, ...limited,
      body: RegisterRecruiterBody,
      response: Pending,
      errors: ["EMAIL_TAKEN", "RATE_LIMITED"],
      handler: ({ body }) => svc.registerRecruiter(body),
    }),
    route({
      method: "post", path: "/auth/verify-otp", summary: "Verify email with the 6-digit code. Students become active at once; recruiters move to the admin approval queue",
      auth: "public", ...limited, body: VerifyOtpBody, response: Pending,
      errors: ["OTP_INVALID", "OTP_LOCKED"],
      handler: ({ body }) => svc.verifyEmail(body.email, body.code),
    }),
    route({
      method: "post", path: "/auth/resend-otp", summary: "Resend the email verification code",
      auth: "public", ...limited, body: EmailBody, response: Ok, errors: ["OTP_RESEND_TOO_SOON"],
      handler: ({ body }) => svc.resendVerification(body.email),
    }),
    route({
      method: "post", path: "/auth/login", summary: "Login for all three portals; `user.role` tells the frontend which portal to open",
      auth: "public", ...limited, body: LoginBody, response: Session,
      errors: ["INVALID_CREDENTIALS", "EMAIL_NOT_VERIFIED", "PENDING_ADMIN_APPROVAL", "ACCOUNT_REJECTED"],
      handler: ({ body }) => svc.login(body.email, body.password),
    }),
    route({
      method: "post", path: "/auth/refresh", summary: "Exchange a refresh token for a new token pair",
      auth: "public", body: RefreshBody, response: Session, errors: ["REFRESH_INVALID"],
      handler: ({ body }) => svc.refresh(body.refresh_token),
    }),
    route({
      method: "post", path: "/auth/logout", summary: "Revoke all tokens of the current user",
      auth: ["admin", "student", "company"], allowDuringPasswordChange: true, allowAlumniWrite: true, response: Ok,
      handler: ({ user }) => svc.logout(user.id),
    }),
    route({
      method: "post", path: "/auth/change-password", summary: "Change password (required on first login for admin-created accounts)",
      auth: ["admin", "student", "company"], allowDuringPasswordChange: true, allowAlumniWrite: true,
      body: ChangePasswordBody, response: Session, errors: ["INVALID_CREDENTIALS"],
      handler: ({ user, body }) => svc.changePassword(user.id, body.current_password, body.new_password),
    }),
    route({
      method: "post", path: "/auth/forgot-password", summary: "Email a reset code. Also how CSV-imported students set their first password.",
      auth: "public", ...limited, body: EmailBody, response: Ok,
      handler: ({ body }) => svc.forgotPassword(body.email),
    }),
    route({
      method: "post", path: "/auth/reset-password", summary: "Set a new password with the emailed code",
      auth: "public", ...limited, body: ResetPasswordBody, response: Ok,
      errors: ["OTP_INVALID", "OTP_LOCKED"],
      handler: ({ body }) => svc.resetPassword(body.email, body.code, body.new_password),
    }),
    route({
      method: "post", path: "/auth/resubmit/recruiter", summary: "Rejected recruiter corrects details (see review_note) and re-enters the approval queue",
      auth: "public", ...limited, body: ResubmitRecruiterBody, response: Pending,
      errors: ["INVALID_CREDENTIALS", "INVALID_TRANSITION"],
      handler: ({ body }) => svc.resubmitRecruiter(body),
    }),
    route({
      method: "get", path: "/auth/me", summary: "Current user",
      auth: ["admin", "student", "company"], allowDuringPasswordChange: true,
      response: Me,
      handler: ({ user }) => svc.me(user),
    }),
  ],
};
