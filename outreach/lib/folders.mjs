// Telegram chat folders, so replies sort themselves.
//
// ## Everything here is best-effort
//
// Folder management is the one part of this tool that talks to an API whose shape has changed
// between Telegram layers, and it is not load-bearing: if it fails, the state file still knows
// exactly who is answered, blocked and silent, and /report still works. So every function here
// swallows its errors and returns false rather than throwing. Losing a folder move must never
// cost a send.
//
// One shape trap worth knowing, because it fails in a confusing way: in this layer
// `DialogFilter.title` is a `TextWithEntities`, NOT a string. Passing a string constructs
// without complaint and then throws "Required object title of DialogFilter is undefined" at
// serialisation — nowhere near the line that caused it.

import { Api } from "telegram";

/** Folder ids 0 and 1 are reserved by Telegram, so custom ones start at 2. */
const FIRST_ID = 2;

/**
 * Folder names, and why they are so terse.
 *
 * **Telegram caps a folder title at 12 characters.** Over that, UpdateDialogFilter fails with
 * `MESSAGE_TOO_LONG` — an error about a message, on a call that contains no message, naming
 * neither the field nor the limit. "EasyQ · Waiting" is 15 and failed exactly this way.
 *
 * Keep any change under 12 or the folders silently stop working.
 */
export const FOLDERS = {
  answered: "EQ Answered", // 11
  blocked: "EQ Blocked", //  10
  waiting: "EQ Waiting", //  10
};

/** Telegram's limit. Checked before the call so the failure names itself. */
const MAX_TITLE = 12;

for (const [key, name] of Object.entries(FOLDERS)) {
  if (name.length > MAX_TITLE) {
    throw new Error(
      `Folder title "${name}" (${key}) is ${name.length} characters; Telegram allows ${MAX_TITLE}.`
    );
  }
}

function title(text) {
  return new Api.TextWithEntities({ text, entities: [] });
}

function titleText(value) {
  // Tolerates both shapes so a future layer change does not break reading.
  return typeof value === "string" ? value : (value?.text ?? "");
}

async function listFilters(client) {
  const result = await client.invoke(new Api.messages.GetDialogFilters());
  // Older builds return a bare array; newer ones return { filters: [...] }.
  const filters = Array.isArray(result) ? result : (result?.filters ?? []);
  return filters.filter((f) => f instanceof Api.DialogFilter);
}

/**
 * Put a chat into one of our folders, creating it if needed and removing them from the others.
 *
 * A chat living in two EasyQ folders at once would make the folders lie, so this is a move,
 * not an add.
 */
export async function moveToFolder(client, entity, folderKey) {
  const wanted = FOLDERS[folderKey];
  if (!wanted) return false;

  try {
    const filters = await listFilters(client);
    const ours = new Set(Object.values(FOLDERS));
    const inputPeer = await client.getInputEntity(entity);
    const peerId = String(entity.id ?? entity.userId ?? "");

    const samePeer = (peer) => {
      const id = peer?.userId ?? peer?.chatId ?? peer?.channelId;
      return id !== undefined && String(id) === peerId;
    };

    let target = filters.find((f) => titleText(f.title) === wanted);

    // Take them out of the other EasyQ folders first.
    for (const filter of filters) {
      const name = titleText(filter.title);
      if (!ours.has(name) || name === wanted) continue;
      const kept = (filter.includePeers ?? []).filter((peer) => !samePeer(peer));
      if (kept.length === (filter.includePeers ?? []).length) continue;
      await client.invoke(
        new Api.messages.UpdateDialogFilter({
          id: filter.id,
          filter: new Api.DialogFilter({
            id: filter.id,
            title: title(name),
            pinnedPeers: filter.pinnedPeers ?? [],
            includePeers: kept,
            excludePeers: filter.excludePeers ?? [],
          }),
        })
      );
    }

    if (target) {
      if ((target.includePeers ?? []).some(samePeer)) return true;
      await client.invoke(
        new Api.messages.UpdateDialogFilter({
          id: target.id,
          filter: new Api.DialogFilter({
            id: target.id,
            title: title(wanted),
            pinnedPeers: target.pinnedPeers ?? [],
            includePeers: [...(target.includePeers ?? []), inputPeer],
            excludePeers: target.excludePeers ?? [],
          }),
        })
      );
      return true;
    }

    // Not there yet — take the lowest free id rather than assuming a count, since a manually
    // deleted folder leaves a gap.
    const used = new Set(filters.map((f) => f.id));
    let id = FIRST_ID;
    while (used.has(id)) id += 1;

    await client.invoke(
      new Api.messages.UpdateDialogFilter({
        id,
        filter: new Api.DialogFilter({
          id,
          title: title(wanted),
          pinnedPeers: [],
          includePeers: [inputPeer],
          excludePeers: [],
        }),
      })
    );
    return true;
  } catch (error) {
    // Most likely: the account is on a free plan and already at the folder limit, or the layer
    // moved again. Neither is worth failing a send over.
    console.log(`    (folder "${wanted}" not updated: ${error?.message ?? error})`);
    return false;
  }
}
