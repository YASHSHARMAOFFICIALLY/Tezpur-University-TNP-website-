import { z } from "zod";
import { route, type ModuleDef } from "../../http/route.js";
import { SettingBody, SettingKeyParams, SettingView } from "./settings.schemas.js";
import * as svc from "./settings.service.js";

export const settingsModule: ModuleDef = {
  name: "settings",
  routes: [
    route({
      method: "get", path: "/admin/settings", summary: "Every admin-editable setting with its current value, default and a plain-English explanation",
      auth: ["admin"], response: z.array(SettingView),
      handler: () => svc.listSettings(),
    }),
    route({
      method: "put", path: "/admin/settings/:key", summary: "Change a setting (takes effect immediately, audited). details.message explains a rejected value.",
      auth: ["admin"], params: SettingKeyParams, body: SettingBody, response: SettingView,
      handler: ({ params, body, actor }) => svc.setSetting(params.key, body.value, actor),
    }),
    route({
      method: "delete", path: "/admin/settings/:key", summary: "Put a setting back to its default (audited)",
      auth: ["admin"], params: SettingKeyParams, response: SettingView,
      handler: ({ params, actor }) => svc.resetSetting(params.key, actor),
    }),
  ],
};
