import { captionLines, captionWords } from "@dax/core";
import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  captionAt,
  captionLook,
  previewCaptionLines,
  previewCaptionWords,
} from "../lib/captions-preview";
import { clip, defaultProject, makeApi, makeProject, makeState, renderEditor } from "../test-utils";
import { CaptionLayer, captionStyle } from "./CaptionLayer";
import { PreviewPane } from "./PreviewPane";

const words = (texts: string[], from = 0, step = 0.5) =>
  texts.map((text, i) => ({ text, start: from + i * step, end: from + i * step + step * 0.8 }));

/** A project whose clips carry a transcript, with captions turned on. */
function captioned(style: "classic" | "bold-pop" | "minimal" = "classic") {
  const p = makeProject([clip("c1", "a", 0, 4), clip("c2", "a", 6, 9)]);
  const asset = p.assets.a;
  if (!asset) throw new Error("fixture");
  asset.transcript = {
    words: [
      ...words(["Hello", "there", "my", "friend."], 0.5),
      ...words(["Second", "sentence", "starts"], 2.5),
      ...words(["Cut", "out", "words"], 4.5), // outside both clips' source ranges (4..6)
      ...words(["After", "the", "cut"], 6.2),
    ],
  };
  p.timeline.captions = {
    style,
    maxWords: 3,
    uppercase: false,
    color: "#ffffff",
    highlight: "#facc15",
    position: "bottom",
  };
  return p;
}

describe("caption preview mirrors the export", () => {
  it("finds the same words in timeline time as core", () => {
    const p = captioned();
    expect(previewCaptionWords(p)).toEqual(captionWords(p));
  });

  it("groups lines the same way as core for several settings", () => {
    const p = captioned();
    for (const maxWords of [1, 2, 3, 4, 8]) {
      expect(previewCaptionLines(p, maxWords)).toEqual(captionLines(p, maxWords));
    }
  });

  it("drops words that were cut out of the timeline", () => {
    const texts = previewCaptionWords(captioned()).map((w) => w.text);
    expect(texts).not.toContain("Cut");
    expect(texts).toContain("After");
  });

  it("finds the line and the word being spoken at a time", () => {
    const lines = previewCaptionLines(captioned(), 3);
    expect(captionAt(lines, 0)).toBeNull(); // before the first word
    const a = captionAt(lines, 0.6);
    expect(a?.line.words.map((w) => w.text)).toEqual(["Hello", "there", "my"]);
    expect(a?.activeWord).toBe(0);
    expect(captionAt(lines, 1.2)?.activeWord).toBe(1);
    expect(captionAt(lines, 99)).toBeNull();
  });

  it("looks up the right line in a long list", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      start: i,
      end: i + 0.9,
      words: [{ text: `w${i}`, start: i, end: i + 0.9 }],
    }));
    expect(captionAt(many, 137.5)?.line.words[0]?.text).toBe("w137");
    expect(captionAt(many, 137.95)).toBeNull();
  });
});

describe("caption styles", () => {
  it("scales the look with the frame and mirrors the export sizes", () => {
    expect(captionLook("classic")).toMatchObject({ sizeCqh: 5, boxed: true, bold: false });
    expect(captionLook("bold-pop")).toMatchObject({ sizeCqh: 7.5, bold: true, boxed: false });
    expect(captionLook("minimal").sizeCqh).toBe(4.5);
  });

  it("positions captions at the bottom, top or centre", () => {
    const base = {
      style: "classic",
      maxWords: 3,
      uppercase: false,
      color: "#ffffff",
      highlight: "#facc15",
    } as const;
    expect(captionStyle({ ...base, position: "bottom" }).bottom).toBe("7cqh");
    expect(captionStyle({ ...base, position: "top" }).top).toBe("7cqh");
    expect(captionStyle({ ...base, position: "center" }).top).toBe("50cqh");
  });
});

describe("CaptionLayer and PreviewPane", () => {
  it("renders nothing without captions", () => {
    renderEditor(<CaptionLayer project={defaultProject()} />, makeApi(makeState(defaultProject())));
    expect(screen.queryByTestId("caption")).not.toBeInTheDocument();
  });

  it("the preview draws captions as the playhead moves, uppercase when asked", async () => {
    const p = captioned("bold-pop");
    if (p.timeline.captions) p.timeline.captions.uppercase = true;
    const { useEditor } = await import("../context");
    let ed: ReturnType<typeof useEditor> | null = null;
    function Probe() {
      ed = useEditor();
      return null;
    }
    renderEditor(
      <>
        <Probe />
        <PreviewPane />
      </>,
      makeApi(makeState(p)),
    );
    act(() => ed?.setPlayhead(1.2));
    const caption = screen.getByTestId("caption");
    expect(caption).toHaveTextContent("HELLO THERE MY");
    // The word being spoken (second one) carries the highlight colour.
    const spans = caption.querySelectorAll("span");
    expect(spans[1]?.style.color).toBe("rgb(250, 204, 21)");
    expect(spans[0]?.style.color).toBe("");
  });

  it("applies the project's fit to the video elements", () => {
    const p = defaultProject();
    p.timeline.fit = "cover";
    renderEditor(<PreviewPane />, makeApi(makeState(p)));
    expect(screen.getByTestId("video-a").style.objectFit).toBe("cover");
    p.timeline.fit = "blur";
    renderEditor(<PreviewPane />, makeApi(makeState(p)));
    expect(screen.getAllByTestId("video-a")[1]?.style.objectFit).toBe("contain");
  });
});
