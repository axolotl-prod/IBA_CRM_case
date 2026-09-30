import { createServerFn } from "@tanstack/react-start";

export const loadTelegramChats = createServerFn({ method: "POST" })
  .validator((data: { userId: string; chatId?: string; leadId?: string }) => data)
  .handler(async ({ data }) => {
    const { readTelegramChats } = await import("../server/database");
    return readTelegramChats(data.userId, data.chatId || "", data.leadId || "");
  });

export const loadTelegramUnreadCount = createServerFn({ method: "POST" })
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const { telegramUnreadCount } = await import("../server/database");
    return telegramUnreadCount(data.userId);
  });

export const sendTelegramMessage = createServerFn({ method: "POST" })
  .validator((data: { userId: string; chatId: string; text: string }) => data)
  .handler(async ({ data }) => {
    const { sendTelegramChatMessage } = await import("../server/database");
    await sendTelegramChatMessage(data.userId, data.chatId, data.text);
    return { ok: true };
  });

export const sendTelegramFile = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = String(data.get("userId") || "");
    const chatId = String(data.get("chatId") || "");
    const caption = String(data.get("caption") || "");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Файл не выбран");
    const { sendTelegramChatFile } = await import("../server/database");
    await sendTelegramChatFile(userId, chatId, file, caption);
    return { ok: true };
  });

export const downloadTelegramAttachment = createServerFn({ method: "POST" })
  .validator((data: { userId: string; messageId: string }) => data)
  .handler(async ({ data }) => {
    const { readTelegramAttachment } = await import("../server/database");
    return readTelegramAttachment(data.userId, data.messageId);
  });
