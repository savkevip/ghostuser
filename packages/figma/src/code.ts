// GhostUser Figma plugin — sandbox side.
// Runs inside Figma's plugin sandbox. No DOM, no fetch. Talks to ui.html via postMessage.

figma.showUI(__html__, { width: 380, height: 620, themeColors: true });

type FrameExport = {
  id: string;
  name: string;
  base64: string;
  width: number;
  height: number;
};

type UiMessage =
  | { type: "ready" }
  | { type: "run"; goal: string; personaId: string }
  | { type: "get-stored-key" }
  | { type: "store-key"; key: string }
  | { type: "get-stored-context" }
  | { type: "store-context"; context: string }
  | { type: "close" };

const STORAGE_KEY = "ghostuser:apikey";
const STORAGE_CONTEXT = "ghostuser:context";

function selectedFrames(): readonly FrameNode[] {
  const sel = figma.currentPage.selection;
  return sel.filter((n): n is FrameNode => n.type === "FRAME") as FrameNode[];
}

async function exportSelectedFrames(): Promise<FrameExport[]> {
  const frames = selectedFrames();
  if (frames.length === 0) {
    return [];
  }
  const out: FrameExport[] = [];
  for (const frame of frames) {
    try {
      const bytes = await frame.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 },
      });
      out.push({
        id: frame.id,
        name: frame.name,
        base64: figma.base64Encode(bytes),
        width: frame.width,
        height: frame.height,
      });
    } catch (e) {
      figma.notify(`Failed to export frame "${frame.name}": ${(e as Error).message}`);
    }
  }
  return out;
}

figma.ui.onmessage = async (msg: UiMessage) => {
  if (msg.type === "get-stored-key") {
    const key = (await figma.clientStorage.getAsync(STORAGE_KEY)) as
      | string
      | undefined;
    figma.ui.postMessage({ type: "stored-key", key: key ?? "" });
    return;
  }

  if (msg.type === "store-key") {
    await figma.clientStorage.setAsync(STORAGE_KEY, msg.key);
    return;
  }

  if (msg.type === "get-stored-context") {
    const ctx = (await figma.clientStorage.getAsync(STORAGE_CONTEXT)) as
      | string
      | undefined;
    figma.ui.postMessage({ type: "stored-context", context: ctx ?? "" });
    return;
  }

  if (msg.type === "store-context") {
    await figma.clientStorage.setAsync(STORAGE_CONTEXT, msg.context);
    return;
  }

  if (msg.type === "ready") {
    const frames = selectedFrames();
    figma.ui.postMessage({
      type: "selection",
      count: frames.length,
      names: frames.map((f) => f.name),
    });
    return;
  }

  if (msg.type === "run") {
    const frames = selectedFrames();
    if (frames.length === 0) {
      figma.ui.postMessage({
        type: "error",
        message: "Select 1+ frames in Figma before running.",
      });
      return;
    }
    figma.ui.postMessage({ type: "exporting", count: frames.length });
    const exported = await exportSelectedFrames();
    figma.ui.postMessage({ type: "exported", frames: exported });
    return;
  }

  if (msg.type === "close") {
    figma.closePlugin();
    return;
  }
};

// Push selection updates as the user changes selection.
figma.on("selectionchange", () => {
  const frames = selectedFrames();
  figma.ui.postMessage({
    type: "selection",
    count: frames.length,
    names: frames.map((f) => f.name),
  });
});
