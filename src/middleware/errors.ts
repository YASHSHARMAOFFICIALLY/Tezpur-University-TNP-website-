// The ONE list of error codes. Codes are API contract: add, never rename.
// The OpenAPI ErrorCode enum and the error envelope are derived from this object.
import { z } from "zod";

export const ERRORS = {
  VALIDATION_FAILED: { status: 400, message: "Request failed validation", hint: "The form sent something the portal does not accept; details say which field. Ask the user to correct it and try again." },
  UNAUTHENTICATED: { status: 401, message: "Missing or invalid access token", hint: "The user's session expired or they logged out elsewhere. Ask them to log in again." },
  FORBIDDEN: { status: 403, message: "Not allowed", hint: "This account's role cannot do that. Check they are using the right portal (admin, student or recruiter)." },
  NOT_FOUND: { status: 404, message: "Not found", hint: "The record does not exist or this user may not see it. Check the link, or whether the item was deleted or not yet released." },
  CONFLICT: { status: 409, message: "Conflicting state", hint: "Someone else changed the same record at the same moment. Reload the page and try once more." },
  RATE_LIMITED: { status: 429, message: "Too many requests", hint: "Too many attempts in a minute. Wait a minute, or use 'Clear login limit' on the user's page if they are locked out." },
  INTERNAL: { status: 500, message: "Internal error", hint: "Something broke on the server. Open the error log for this time; if it repeats, share the summary with the developer." },

  INVALID_CREDENTIALS: { status: 401, message: "Email or password is wrong", hint: "Wrong email or password. The user can use 'Forgot password', or you can use 'Reset password' on their page." },
  REFRESH_INVALID: { status: 401, message: "Refresh token invalid or revoked", hint: "The saved login is no longer valid (password changed or logged out). The user just logs in again." },
  EMAIL_TAKEN: { status: 409, message: "Email already registered", hint: "An account with this email already exists. Search for it in the admin portal instead of creating another." },
  ENROLMENT_TAKEN: { status: 409, message: "Enrolment number already registered", hint: "This enrolment number is already registered. Search for the student; the number may have been imported by CSV." },
  EMAIL_DOMAIN_NOT_ALLOWED: { status: 422, message: "Students must register with their university email", hint: "Students must sign up with their university email. Check the 'Student email domain' setting if this is wrong for everyone." },
  EMAIL_NOT_VERIFIED: { status: 403, message: "Verify your email first", hint: "The user has not entered their email code yet. Use 'Resend code' on their page if the email never arrived." },
  PENDING_ADMIN_APPROVAL: { status: 403, message: "Account awaiting admin approval", hint: "The account is waiting in the approval queue. Approve or reject it under Pending." },
  ACCOUNT_REJECTED: { status: 403, message: "Account was rejected", hint: "This account was rejected; the reason is shown to the user. Recruiters can correct and resubmit." },
  PASSWORD_CHANGE_REQUIRED: { status: 403, message: "Change your password to continue", hint: "The user must set a new password before anything else. Ask them to follow the change-password screen." },
  ALUMNI_READ_ONLY: { status: 403, message: "Alumni accounts are read-only", hint: "Graduated students can only view. If they graduated by mistake, check their year of completion and the alumni cutoff setting." },
  OTP_INVALID: { status: 422, message: "Code is wrong or expired", hint: "The code is wrong or expired. Ask the user to request a new code and use the newest email." },
  OTP_LOCKED: { status: 429, message: "Too many wrong attempts, request a new code", hint: "Too many wrong codes. The user must request a new code." },
  OTP_RESEND_TOO_SOON: { status: 429, message: "Wait before requesting another code", hint: "A code was sent less than a minute ago. Wait one minute before sending another." },

  ON_PROBATION: { status: 403, message: "Students on academic probation cannot apply or register", hint: "The student is on academic probation. Lift it from the student's page if that is no longer right." },
  PROFILE_INCOMPLETE: { status: 422, message: "Complete your profile first (details.missing lists the fields)", hint: "The student's profile is missing required fields (listed in details). Ask them to complete it." },

  NOT_ELIGIBLE: { status: 422, message: "You do not meet the eligibility criteria", hint: "The student does not meet this posting's criteria; details list each rule. Edit the posting if the criteria are wrong." },
  OPPORTUNITY_NOT_OPEN: { status: 409, message: "Opportunity is not accepting applications", hint: "The posting is closed, not yet approved, or past its deadline. Check its status and deadline." },
  ALREADY_APPLIED: { status: 409, message: "Already applied", hint: "The student has already applied to this posting. Nothing to do." },
  INVALID_TRANSITION: { status: 409, message: "That status change is not allowed from the current state", hint: "That action does not fit the record's current state. Reload to see the current status first." },

  REGISTRATION_CLOSED: { status: 409, message: "Registration window is closed", hint: "The event's registration window is not open. Change the window on the event if needed." },
  ALREADY_REGISTERED: { status: 409, message: "Already registered", hint: "The student is already registered for this event. Nothing to do." },

  FILE_TOO_LARGE: { status: 413, message: "File too large", hint: "The file is bigger than allowed. Ask for a smaller file, or raise the limit under Settings (up to the built-in maximum)." },
  FILE_TYPE_NOT_ALLOWED: { status: 415, message: "File type not allowed for this kind", hint: "Only PDF (or JPEG/PNG for photos) is accepted, checked from the file itself. Ask the user to export a real PDF or image." },

  // logOnly: recorded in error_log, never sent as an HTTP response, so it is not an ErrorCode.
  JOB_FAILED: { status: 500, message: "Background job failed", hint: "A background task gave up after several tries. If it was an email, use 'Retry failed emails' once mail works again.", logOnly: true },
} as const satisfies Record<string, { status: number; message: string; hint: string; logOnly?: true }>;

/** Every code in the registry, including log-only ones (admin views). */
export type AnyErrorCode = keyof typeof ERRORS;
/** Codes an HTTP response can carry. */
export type ErrorCode = { [K in AnyErrorCode]: (typeof ERRORS)[K] extends { logOnly: true } ? never : K }[AnyErrorCode];
const RESPONSE_CODES = (Object.keys(ERRORS) as AnyErrorCode[]).filter((c): c is ErrorCode => !("logOnly" in ERRORS[c]));

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details: Record<string, unknown> = {},
    message?: string,
  ) {
    super(message ?? ERRORS[code].message);
  }
}

/** The only way to signal a contract error. Returns never so TS narrows after it. */
export function fail(code: ErrorCode, details?: Record<string, unknown>, message?: string): never {
  throw new AppError(code, details, message);
}

export const ErrorBody = z
  .object({
    error: z.object({
      code: z.enum(RESPONSE_CODES as [ErrorCode, ...ErrorCode[]]),
      message: z.string(),
      details: z.record(z.string(), z.unknown()),
    }),
  })
  .meta({ id: "Error" });
