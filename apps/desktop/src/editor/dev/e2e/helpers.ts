// Shared helpers for the editor e2e tests: reset the mock server, open the harness, read project state, and
// drag with the mouse (the editor uses pointer events, so real mouse movement exercises the same paths).

import { expect, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:4390";
const TOKEN = "dev-token";
export const SHOTS = "src/editor/dev/.artifacts/screenshots";

/** The pieces of project state the tests read back from the server (the source of truth). */
export interface Snapshot {
  clips: {
    id: string;
    assetId: string;
    start: number;
    in: number;
    out: number;
    volume: number;
    fadeIn: number;
    fadeOut: number;
  }[];
  overlays: {
    id: string;
    start: number;
    duration: number;
    text: string;
    animation: string;
    style: { color: string; fontSize: number; position: string };
  }[];
  canUndo: boolean;
  canRedo: boolean;
}

/** Reset the mock server to the three demo clips and open the harness. */
export async function openHarness(page: Page): Promise<void> {
  const r = await page.request.post(`${MOCK}/api/reset?token=${TOKEN}`);
  expect(r.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByTestId("clip")).toHaveCount(3);
}

/** Fetch the project from the mock server. */
export async function snapshot(page: Page): Promise<Snapshot> {
  const r = await page.request.get(`${MOCK}/api/state?token=${TOKEN}`);
  const s = await r.json();
  const track = s.project.timeline.tracks.find((t: { id: string }) => t.id === "v1");
  return {
    clips: track.clips,
    overlays: s.project.timeline.overlays,
    canUndo: s.canUndo,
    canRedo: s.canRedo,
  };
}

/** Send a command straight to the mock server (to set up a situation quickly). */
export async function command(
  page: Page,
  name: string,
  args: Record<string, unknown> = {},
): Promise<void> {
  const r = await page.request.post(`${MOCK}/api/command?token=${TOKEN}`, { data: { name, args } });
  expect(r.ok(), await r.text()).toBeTruthy();
}

/** Pixels per second currently used by the timeline, read from a clip's size. */
export async function zoomOf(page: Page): Promise<number> {
  const clip = page.getByTestId("clip").first();
  const w = (await clip.boundingBox())?.width ?? 0;
  const d = Number(await clip.getAttribute("data-duration"));
  return w / d;
}

/** Playhead position in seconds, as drawn. */
export async function playheadTime(page: Page): Promise<number> {
  return Number(await page.getByTestId("playhead").getAttribute("data-time"));
}

/** Drag from one point to another in steps with the real mouse. */
export async function dragMouse(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Centre of an element's bounding box. */
export async function centre(
  page: Page,
  testId: string,
  nth = 0,
): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(testId).nth(nth).boundingBox();
  if (!box) throw new Error(`no box for ${testId}[${nth}]`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
