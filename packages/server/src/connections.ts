// Explicit immutable connection snapshots; no inference, automatic fallback or secret-bearing public response.
import { randomUUID } from "node:crypto";
import type { ConnectionRequest, ProviderKind, Settings } from "@dax/protocol";
import { HttpError } from "./http-util.js";
import type { SecretStore, SettingsStore } from "./stores.js";

/** Apply a validated connection action while the engine holds its serial mutation lock. Loading clears the old key first, so interrupted activation fails closed. */
export async function changeConnection(
  request: ConnectionRequest,
  settings: SettingsStore,
  secrets: SecretStore,
  getKey: (kind: ProviderKind, current: Settings) => string | undefined,
): Promise<Settings> {
  const current = settings.get();
  const list = current.savedConnections ?? [];
  if (request.action === "save") {
    if (list.length >= 24)
      throw new HttpError(409, "Remove a saved connection before adding another (limit 24).");
    const id = randomUUID();
    await secrets.setConnectionKey(id, getKey(request.kind, current));
    try {
      return await settings.set(current, [
        ...list,
        {
          id,
          name: request.name,
          kind: request.kind,
          config: current.providers[request.kind] ?? {},
        },
      ]);
    } catch (error) {
      await secrets.setConnectionKey(id, undefined);
      throw error;
    }
  }
  const connection = list.find((item) => item.id === request.id);
  if (!connection) throw new HttpError(404, "Saved connection was not found.");
  if (request.action === "remove") {
    const saved = await settings.set(
      current,
      list.filter((item) => item.id !== request.id),
    );
    await secrets.setConnectionKey(request.id, undefined);
    return saved;
  }
  const { kind, config } = connection;
  const key = secrets.connectionKey(connection.id);
  // Never retain the previous account's key for a keyless or partially loaded connection.
  await secrets.remove(kind);
  const saved = await settings.set({
    ...current,
    activeProvider: kind,
    providers: { ...current.providers, [kind]: config },
  });
  if (key)
    await secrets.set(
      kind,
      key,
      kind === "openai-compatible" ? (config.baseUrl?.replace(/\/$/, "") ?? "") : undefined,
    );
  return saved;
}
