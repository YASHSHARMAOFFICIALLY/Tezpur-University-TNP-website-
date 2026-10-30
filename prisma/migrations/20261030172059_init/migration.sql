-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'student', 'company');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending_email_verify', 'pending_admin', 'active', 'rejected', 'alumni');

-- CreateEnum
CREATE TYPE "AcademicStanding" AS ENUM ('good', 'probation');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('verify_email', 'password_reset');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('resume', 'photo', 'jd', 'brochure');

-- CreateEnum
CREATE TYPE "CompanyCategory" AS ENUM ('private', 'mnc', 'govt', 'ngo', 'psu', 'startup', 'other');

-- CreateEnum
CREATE TYPE "OppType" AS ENUM ('job', 'internship', 'competition');

-- CreateEnum
CREATE TYPE "OppStatus" AS ENUM ('draft', 'pending_admin', 'approved', 'rejected', 'closed');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('applied', 'released_to_recruiter', 'shortlisted', 'rejected', 'selected');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('training', 'expert_session', 'awareness', 'workshop');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'published', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "RegStatus" AS ENUM ('registered', 'cancelled', 'confirmed', 'attended');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('students', 'companies', 'all');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL,
    "review_note" TEXT,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "company_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enrolment_no" TEXT NOT NULL,
    "mobile" TEXT,
    "dob" DATE,
    "gender" TEXT,
    "category" TEXT,
    "minority" BOOLEAN,
    "specially_abled" BOOLEAN,
    "regional_diversity" TEXT,
    "jee_rank" INTEGER,
    "jee_score" DOUBLE PRECISION,
    "jee_percentile" DOUBLE PRECISION,
    "gate_qualified" BOOLEAN,
    "gate_score" DOUBLE PRECISION,
    "programme_id" TEXT,
    "department" TEXT,
    "year_of_admission" INTEGER,
    "year_of_completion" INTEGER,
    "cgpa" DOUBLE PRECISION,
    "current_address" TEXT,
    "permanent_address" TEXT,
    "marks_10" DOUBLE PRECISION,
    "yop_10" INTEGER,
    "marks_12" DOUBLE PRECISION,
    "yop_12" INTEGER,
    "marks_ug" DOUBLE PRECISION,
    "yop_ug" INTEGER,
    "marks_pg" DOUBLE PRECISION,
    "yop_pg" INTEGER,
    "other_courses" TEXT,
    "professional_interests" TEXT,
    "certifications" TEXT,
    "portfolio_url" TEXT,
    "linkedin_url" TEXT,
    "resume_file_id" TEXT,
    "photo_file_id" TEXT,
    "academic_standing" "AcademicStanding" NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "postal_address" TEXT,
    "website" TEXT,
    "category" "CompanyCategory" NOT NULL DEFAULT 'other',
    "sector" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,

    CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_profile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "website" TEXT,
    "est_year" INTEGER,
    "ranking" TEXT,
    "achievements" TEXT,
    "contact_emails" TEXT[],
    "admin_mobiles" TEXT[],

    CONSTRAINT "university_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programmes" (
    "id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER,
    "student_count" INTEGER,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_records" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "brochure_file_id" TEXT,

    CONSTRAINT "placement_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" "OppType" NOT NULL,
    "title" TEXT NOT NULL,
    "job_profile" TEXT,
    "description" TEXT NOT NULL,
    "expected_hires" INTEGER,
    "location" TEXT,
    "designation" TEXT,
    "ctc_benefits" TEXT,
    "bond_details" TEXT,
    "apply_deadline" TIMESTAMP(3) NOT NULL,
    "eligibility" JSONB NOT NULL,
    "selection_process" JSONB NOT NULL,
    "jd_file_id" TEXT,
    "status" "OppStatus" NOT NULL,
    "review_note" TEXT,
    "posted_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "eligibility_result" JSONB NOT NULL,
    "status" "AppStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_schedules" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "venue_or_link" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "selected_application_ids" TEXT[],
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "resource_person" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "chargeable" BOOLEAN NOT NULL DEFAULT false,
    "fee" DOUBLE PRECISION,
    "registration_opens_at" TIMESTAMP(3) NOT NULL,
    "registration_closes_at" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" "RegStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "audience" "Audience" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "from_user" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_requests" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_submissions" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "last_error" TEXT,
    "result" JSONB,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "otp_codes_user_id_purpose_created_at_idx" ON "otp_codes"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_enrolment_no_key" ON "students"("enrolment_no");

-- CreateIndex
CREATE UNIQUE INDEX "programmes_code_key" ON "programmes"("code");

-- CreateIndex
CREATE INDEX "placement_records_year_idx" ON "placement_records"("year");

-- CreateIndex
CREATE INDEX "opportunities_status_type_idx" ON "opportunities"("status", "type");

-- CreateIndex
CREATE INDEX "opportunities_company_id_idx" ON "opportunities"("company_id");

-- CreateIndex
CREATE INDEX "applications_opportunity_id_status_idx" ON "applications"("opportunity_id", "status");

-- CreateIndex
CREATE INDEX "applications_student_id_idx" ON "applications"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_opportunity_id_student_id_key" ON "applications"("opportunity_id", "student_id");

-- CreateIndex
CREATE INDEX "interview_schedules_application_id_idx" ON "interview_schedules"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_opportunity_id_key" ON "results"("opportunity_id");

-- CreateIndex
CREATE INDEX "events_status_registration_closes_at_idx" ON "events"("status", "registration_closes_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_event_id_student_id_key" ON "event_registrations"("event_id", "student_id");

-- CreateIndex
CREATE INDEX "notices_audience_published_at_idx" ON "notices"("audience", "published_at");

-- CreateIndex
CREATE INDEX "messages_company_id_created_at_idx" ON "messages"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_submissions_request_id_user_id_key" ON "feedback_submissions"("request_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_path_key" ON "files"("storage_path");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_created_at_idx" ON "audit_log"("entity", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_created_at_idx" ON "audit_log"("actor_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupe_key_key" ON "jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "jobs_status_priority_run_after_idx" ON "jobs"("status", "priority", "run_after");

-- CreateIndex
CREATE INDEX "jobs_type_status_finished_at_idx" ON "jobs"("type", "status", "finished_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_schedules" ADD CONSTRAINT "interview_schedules_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "feedback_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
