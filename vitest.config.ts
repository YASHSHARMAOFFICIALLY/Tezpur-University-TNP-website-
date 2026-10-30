import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://tnp:tnp@localhost:5434/tnp_test",
      JWT_SECRET: "test-secret-test-secret-test-secret-test",
      OTP_SECRET: "test-otp-test-otp-test-otp-test-otp-test",
      SMTP_HOST: "",
      UPLOAD_DIR: "./data/test-uploads",
    },
    globalSetup: "./test/setup.ts",
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
