import { createServerFn } from "@tanstack/react-start";
import type { CrmMutation } from "./crm-types";

export const loadCrmData = createServerFn({ method: "GET" }).handler(async () => {
  const { readCrmData } = await import("../server/database");
  return readCrmData();
});

export const syncGoogleSheets = createServerFn({ method: "POST" }).handler(async () => {
  const { syncGoogleSheetLeads } = await import("../server/database");
  return syncGoogleSheetLeads();
});

export const authenticate = createServerFn({ method: "POST" })
  .validator((data: { login: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { authenticateUser } = await import("../server/database");
    return authenticateUser(data.login, data.password);
  });

export const mutateCrmData = createServerFn({ method: "POST" })
  .validator((data: CrmMutation) => data)
  .handler(async ({ data }) => {
    const { applyCrmMutation, readCrmData } = await import("../server/database");
    applyCrmMutation(data);
    return readCrmData();
  });
