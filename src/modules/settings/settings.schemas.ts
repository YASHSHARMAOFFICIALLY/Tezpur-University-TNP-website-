import { z } from "zod";
import { SETTING_KEYS } from "./settings.registry.js";

export const SettingKeyParams = z.object({ key: z.enum(SETTING_KEYS) });
export const SettingBody = z.object({ value: z.unknown() });
export const SettingView = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.unknown(),
  default: z.unknown(),
  is_overridden: z.boolean(),
  label: z.string(),
  help: z.string(),
  unit: z.string(),
});
