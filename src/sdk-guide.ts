import { appid, assert, number } from "./core.js";
export function sdkGuide(kind: string, p: any): any {
  assert(
    ["lobby", "workshop", "trailer"].includes(kind),
    "INVALID_ARGUMENT",
    "支持 lobby|workshop|trailer",
  );
  if (kind === "trailer")
    return {
      mode: "guide",
      executed: false,
      live_upload_implemented: false,
      steps: [
        "在 Steamworks 选择 App 和商店页面的预告片栏目",
        "上传本地视频并等待服务器转码",
        "预览视频、核对语言和顺序后单独发布页面",
      ],
      documentation: "https://partner.steamgames.com/doc/store/trailer",
    };
  const code =
    kind === "lobby"
      ? `// Run inside an initialized Steamworks SDK application.\n// Register a LobbyCreated_t call-result handler and check m_eResult.\nSteamAPICall_t call = SteamMatchmaking()->CreateLobby(k_ELobbyTypePublic, ${number(p.members ?? 4, "members", 1, 250)});\n// Pump SteamAPI_RunCallbacks() until the call-result arrives.\n`
      : `// Run inside the owning App's initialized Steamworks SDK application.\n// CreateItem completes through CreateItemResult_t; handle legal agreement first.\nSteamAPICall_t call = SteamUGC()->CreateItem(${appid(p.appid)}, k_EWorkshopFileTypeCommunity);\n// After receiving m_nPublishedFileId, call StartItemUpdate, SetItemContent,\n// SetItemTitle, and SubmitItemUpdate. Register SubmitItemUpdateResult_t.\n// Keep pumping SteamAPI_RunCallbacks(); check every API result.\n`;
  return {
    mode: "guide",
    executed: false,
    requires: "owning Steamworks SDK application and callback loop",
    code,
    documentation:
      kind === "lobby"
        ? "https://partner.steamgames.com/doc/api/ISteamMatchmaking"
        : "https://partner.steamgames.com/doc/features/workshop/implementation",
  };
}
