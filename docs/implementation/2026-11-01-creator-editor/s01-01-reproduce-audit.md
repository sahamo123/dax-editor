---
type: Guide
title: Reproduce the S01.01 synthetic workspace audit
description: Portable procedure and test harness for recapturing the browser audit without uploading private screenshots.
tags: [implementation, workspace, audit, testing, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T14:00:00Z
---

# Reproduce the S01.01 synthetic workspace audit

This guide preserves the temporary test harness behind [the audit receipt](s01-01-audit-receipt.md). It creates new synthetic media and an isolated test engine; it does not open the user's projects. It is a reproduction aid, not evidence that a different machine, native app, model or provider has passed. The historical screenshots remain ignored on the original laptop. Automatic approval review rejected uploading screenshot payloads because their sensitive-data content was not independently verified; do not work around that rejection via an indirect upload.

On November 1, 2026, the three code blocks and configuration were extracted from this guide into a new ignored folder and the three listed Playwright runs passed individually on the original Windows laptop with Edge and explicit system FFmpeg. They regenerated 30 screenshots; the 1366×768 default/max preview measurements matched the receipt. The normal-host process exited zero and no test preview remained on port 4173. This checks the guide on the same laptop only; no screenshot was uploaded and no other machine or native runtime is certified.

## Prepare

Use the documented Node/pnpm setup and built workspace dependencies from the [continuation guide](../../engineering/laptop-continuation.md). The scripts import the repository's current Playwright fixture, which makes a six-second generated video and cleans its own temporary engine/media on normal teardown. They start a Vite preview on **127.0.0.1:4173** without reusing a listener; check that the port is free and never stop unrelated processes. They use generated video only; do not substitute a private project or private video. Logs and captures can show local paths and must remain private.

The tested baseline is commit `1d520153a1f81d2429f815d2db5e655e1a0d538d`; newer source can change behavior and screenshot hashes. Use a policy-authorized environment and a compatible H.264 browser. The original run explicitly selected system FFmpeg and Edge; that does not validate bundled FFmpeg or WebView2. Do not change system security policy. On this laptop the runtime sandbox prevented the test process from completing; the successful evidence was collected in an authorized normal-host process.

In PowerShell at the repository root, create a **new** folder immediately beneath ignored `artifacts/`, and set the media-tool paths deliberately. Select a locally installed Edge executable or another compatible browser when necessary. Never set a real token or API key for this audit.

```powershell
$systemFfmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$systemFfprobe = (Get-Command ffprobe -ErrorAction Stop).Source
. .\scripts\Enter-Dev.ps1
$env:DAX_FFMPEG = $systemFfmpeg
$env:DAX_FFPROBE = $systemFfprobe
$env:PW_CHROMIUM = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:AUDIT_DIR = Join-Path (Get-Location) ("artifacts\s01-audit-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $env:AUDIT_DIR | Out-Null
'{"type":"module"}' | Set-Content -LiteralPath (Join-Path $env:AUDIT_DIR 'package.json') -Encoding utf8
```

Write the four exact code blocks below to `audit.config.ts`, `audit.spec.ts`, `controls.spec.ts` and `frame.spec.ts` in that new folder. Paths are intentionally relative to a direct child of `artifacts/`. Do not use the original `s01-01-workspace-audit-20261101` folder or any existing results: the scripts write screenshots by filename and could overwrite them.

Run each test serially. The two derived configurations differ only in the selected test filename. Review output/exit codes and the generated screenshots and JSON yourself; the tests do not grade UX or assert native behavior.

```powershell
$baseConfig = Get-Content -Raw -LiteralPath (Join-Path $env:AUDIT_DIR 'audit.config.ts')
$baseConfig.Replace('testMatch: "audit.spec.ts"','testMatch: "controls.spec.ts"') | Set-Content -LiteralPath (Join-Path $env:AUDIT_DIR 'controls.config.ts') -Encoding utf8
$baseConfig.Replace('testMatch: "audit.spec.ts"','testMatch: "frame.spec.ts"') | Set-Content -LiteralPath (Join-Path $env:AUDIT_DIR 'frame.config.ts') -Encoding utf8
foreach ($config in @('audit.config.ts','controls.config.ts','frame.config.ts')) {
  pnpm --filter @dax/desktop exec playwright test --config (Join-Path $env:AUDIT_DIR $config)
  if ($LASTEXITCODE -ne 0) { throw "Audit failed: $config" }
}
```

A failed or interrupted run is not a pass. Preserve its logs and outputs; use a fresh folder before retrying. The error image can contain account names and installation paths. A separate screenshot that replaces only the account component is **not** a general privacy guarantee. The original redacted-image experiment is not needed for these core captures and is not an authorization to publish them.

## `audit.config.ts`

```typescript
import base from "../../apps/desktop/playwright.config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
export default { ...base, testDir: ".", testMatch: "audit.spec.ts", timeout: 180000,
  outputDir: resolve(here, "results"),
  webServer: { ...base.webServer, cwd: resolve(here, "../../apps/desktop"), reuseExistingServer: false } };
```

## `audit.spec.ts`

```typescript
import { expect, test } from "../../apps/desktop/e2e/fixtures";
import { join } from "node:path";

test("isolated workspace audit", async ({page,startEngine,openApp,sampleVideo}) => {
  test.setTimeout(180000);
  const out=process.env.AUDIT_DIR!;
  const engine=await startEngine();
  await openApp(engine);
  const sizes=[[1366,768],[1440,900],[1920,1080]];
  async function capture(state:string) {
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(350);
      await page.screenshot({path:join(out,`${state}-${width}x${height}.png`)});
    }
  }
  await expect(page.getByText("Drop a video here or click Import")).toBeVisible();
  await capture("empty");
  let picker=page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button",{name:"Import",exact:true}).click();
  await (await picker).setFiles({name:"bad.mp4",mimeType:"video/mp4",buffer:Buffer.from("not video")});
  await expect(page.getByText(/ffprobe|Invalid data|video stream/i).first()).toBeVisible();
  await capture("error");
  picker=page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button",{name:"Import",exact:true}).click();
  await (await picker).setFiles(sampleVideo);
  await expect.poll(async()=>Object.keys((await engine.api.project()).assets).length).toBe(1);
  await engine.api.settled(90000);
  await capture("import");
  const show=page.getByRole("button",{name:"Show side panel",exact:true});
  if(await show.isVisible()) await show.click();
  await page.getByRole("tab",{name:"Tools",exact:true}).click();
  await page.getByLabel("Title at playhead").fill("Workspace audit title");
  await page.getByRole("button",{name:"Add title",exact:true}).click();
  await expect.poll(async()=>JSON.stringify(await engine.api.project())).toContain("Workspace audit title");
  await capture("edit");
  const reviewResponse=page.waitForResponse(r=>r.url().includes("/api/command") && r.request().postDataJSON()?.name==="render_preview");
  await page.getByRole("button",{name:"Review effects",exact:true}).click();
  expect((await (await reviewResponse).json()).ok).toBe(true);
  const review=page.getByLabel("Complete edit review",{exact:true});
  await expect(review).toBeVisible({timeout:60000});
  await expect.poll(()=>review.evaluate((el:HTMLVideoElement)=>el.readyState)).toBeGreaterThanOrEqual(2);
  await capture("review");
  await page.getByRole("button",{name:"Back to editing"}).click();
  await page.getByRole("button",{name:"Export",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Export video"})).toBeVisible();
  await capture("export-dialog");
});
```

## `controls.spec.ts`

```typescript
import { expect, test, chatInput } from "../../apps/desktop/e2e/fixtures";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

test("workspace controls and mock task states", async ({page,startServer,openApp,sampleVideo}) => {
 test.setTimeout(100000);
 const out=process.env.AUDIT_DIR!;
 const server=await startServer({aiReady:true});
 await server.importPaths([sampleVideo]);
 await page.setViewportSize({width:1366,height:768});
 await openApp(server);
 const sizes=[[1366,768],[1440,900],[1920,1080]];
 const metrics=[];
 for(const [width,height] of sizes) {
   await page.setViewportSize({width,height});
   const chat=page.getByRole("separator",{name:"Resize chat panel"});
   await chat.focus(); await page.keyboard.press("End");
   const preview=await page.getByRole("region",{name:"Preview"}).boundingBox();
   const timeline=await page.getByRole("region",{name:"Timeline"}).boundingBox();
   metrics.push({width,height,chat:Number(await chat.getAttribute("aria-valuenow")),preview,timeline,overflow:await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)});
   await page.screenshot({path:join(out,`resize-max-${width}x${height}.png`)});
   await chat.focus(); await page.keyboard.press("Home");
 }
 const chat=page.getByRole("separator",{name:"Resize chat panel"});
 await chat.focus(); await page.keyboard.press("ArrowRight");
 const saved=await chat.getAttribute("aria-valuenow");
 await page.reload();
 await expect(chat).toHaveAttribute("aria-valuenow",saved!);
 await page.getByRole("region",{name:"Timeline"}).getByTestId("clip").first().click();
 await expect(page.getByRole("tab",{name:"Inspector"})).toHaveAttribute("aria-selected","true");
 await page.screenshot({path:join(out,"selection-inspector-1920x1080.png")});
 await page.setViewportSize({width:1024,height:700});
 await page.getByRole("button",{name:"Show side panel",exact:true}).click();
 await expect(page.getByRole("button",{name:"Close tools panel"})).toBeVisible();
 await page.screenshot({path:join(out,"compact-drawer-1024x700.png")});
 await page.getByRole("button",{name:"Close tools panel"}).click();
 await page.setViewportSize({width:1366,height:768});
 await chatInput(page).fill("work slowly please"); await chatInput(page).press("Enter");
 await expect(page.getByRole("button",{name:"Stop",exact:true})).toBeVisible();
 await page.getByLabel("Chat mode",{exact:true}).selectOption("plan");
 await chatInput(page).fill("Plan the later title"); await chatInput(page).press("Enter");
 const task=page.getByRole("list",{name:"Task queue"}).locator("li").filter({hasText:"Plan the later title"});
 await expect(task).toContainText("Queue #1"); await expect(task).toContainText("Plan");
 await chatInput(page).fill("Keep the current title short");
 await expect(page.getByRole("button",{name:"Steer task"})).toBeVisible();
 await page.screenshot({path:join(out,"task-queue-steer-1366x768.png")});
 await task.getByRole("button",{name:"Cancel task"}).click();
 await expect(task).toContainText("cancelled");
 await page.getByRole("button",{name:"Stop",exact:true}).click();
 await expect(page.getByText("Stopped.")).toBeVisible();
 writeFileSync(join(out,"workspace-metrics.json"),JSON.stringify({metrics,savedChatWidth:saved,planningQueue:"observed",stop:"observed",steer:"visible only; server unit evidence separately"},null,2),{flag:"wx"});
});
```

## `frame.spec.ts`

```typescript
import { expect, test } from "../../apps/desktop/e2e/fixtures";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

test("measure loaded preview frame", async ({page,startEngine,openApp,sampleVideo}) => {
 test.setTimeout(100000); const out=process.env.AUDIT_DIR!;
 const engine=await startEngine(); await page.setViewportSize({width:1366,height:768}); await openApp(engine);
 const picker=page.waitForEvent("filechooser"); await page.getByRole("banner").getByRole("button",{name:"Import",exact:true}).click(); await (await picker).setFiles(sampleVideo);
 await expect.poll(async()=>Object.keys((await engine.api.project()).assets).length).toBe(1); await engine.api.settled(90000);
 await expect.poll(()=>page.getByTestId("video-a").evaluate((el:HTMLVideoElement)=>el.readyState)).toBeGreaterThanOrEqual(2);
 const rows=[];
 for (const [width,height] of [[1366,768],[1440,900],[1920,1080]]) {
  await page.setViewportSize({width,height});
  for (const size of ["default","max"]) {
   if(size==="max") { const splitter=page.getByRole("separator",{name:"Resize chat panel"}); await splitter.focus(); await page.keyboard.press("End"); }
   await page.waitForTimeout(200);
   const frame=await page.getByTestId("stage").boundingBox(); const preview=await page.getByRole("region",{name:"Preview"}).boundingBox();
   rows.push({width,height,size,frame,preview});
   await page.screenshot({path:join(out,`frame-${size}-${width}x${height}.png`)});
  }
  const splitter=page.getByRole("separator",{name:"Resize chat panel"}); await splitter.focus(); await page.keyboard.press("Home");
 }
 writeFileSync(join(out,"frame-metrics.json"),JSON.stringify(rows,null,2),{flag:"wx"});
});
```
