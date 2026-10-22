// Manual project controls remain usable without an assistant or API connection.
import { type ReactElement, useState } from "react";
import { useEditor } from "../../editor";
import { useApp, useController } from "../context";

/** Manual output-format, title, captions and template controls over the same command registry as chat. */
export function ProjectTools(): ReactElement {
  const controller = useController();
  const project = useApp((s) => s.state?.project);
  const online = useApp((s) => s.connection.status === "online");
  const { playhead } = useEditor();
  const [title, setTitle] = useState("");
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; variables: string[] }>
  >([]);
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const selected = templates.find((template) => template.id === templateId);
  if (!project) return <p className="muted">Open a project to edit.</p>;
  const loadTemplates = async () => {
    const result = await controller.run("list_templates");
    if (!result.ok || !Array.isArray(result.data)) return;
    setTemplates(
      result.data.flatMap((value: unknown) => {
        if (
          typeof value !== "object" ||
          value === null ||
          !("id" in value) ||
          typeof value.id !== "string" ||
          !("name" in value) ||
          typeof value.name !== "string"
        )
          return [];
        const vars =
          "variables" in value && Array.isArray(value.variables)
            ? value.variables.flatMap((item: unknown) =>
                typeof item === "object" &&
                item !== null &&
                "name" in item &&
                typeof item.name === "string"
                  ? [item.name]
                  : [],
              )
            : [];
        return [{ id: value.id, name: value.name, variables: vars }];
      }),
    );
  };
  return (
    <div className="project-tools stack">
      <h3>Editing tools</h3>
      <p className="muted">Manual changes and assistant changes share the same history.</p>
      <label className="field">
        <span className="field__label">Output format</span>
        <select
          className="input"
          aria-label="Output format"
          value=""
          disabled={!online}
          onChange={(event) => {
            if (event.target.value)
              void controller.run("set_format", {
                preset: event.target.value,
                fit: project.timeline.fit,
              });
          }}
        >
          <option value="">
            {project.timeline.width} × {project.timeline.height} · {project.timeline.fps} fps
          </option>
          <option value="landscape-1080p">Landscape · 1920 × 1080</option>
          <option value="landscape-720p">Landscape · 1280 × 720</option>
          <option value="portrait-1080x1920">Portrait · 1080 × 1920</option>
          <option value="square-1080">Square · 1080 × 1080</option>
          <option value="portrait-4x5">Portrait · 4:5</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">Footage fit</span>
        <select
          className="input"
          value={project.timeline.fit}
          disabled={!online}
          onChange={(event) => void controller.run("set_format", { fit: event.target.value })}
        >
          <option value="contain">Fit with bars</option>
          <option value="cover">Crop to fill</option>
          <option value="blur">Blur background</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">Frame rate</span>
        <select
          className="input"
          aria-label="Frame rate"
          value={project.timeline.fps}
          disabled={!online}
          onChange={(event) =>
            void controller.run("set_format", { fps: Number(event.target.value) })
          }
        >
          {[
            ...new Set([
              project.timeline.fps,
              12,
              15,
              23.976,
              24,
              25,
              29.97,
              30,
              48,
              50,
              59.94,
              60,
              120,
            ]),
          ]
            .sort((a, b) => a - b)
            .map((fps) => (
              <option key={fps} value={fps}>
                {fps} fps
              </option>
            ))}
        </select>
      </label>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.run("add_overlay", {
            preset: "title-fade",
            text: title.trim(),
            start: playhead,
            duration: 3,
          });
        }}
      >
        <label className="field">
          <span className="field__label">Title at playhead</span>
          <input
            className="input"
            maxLength={280}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={!online || !title.trim()}>
          Add title
        </button>
      </form>
      <label className="field">
        <span className="field__label">Caption style</span>
        <select
          className="input"
          value={project.timeline.captions?.style ?? "off"}
          disabled={!online}
          onChange={(event) =>
            void controller.run(
              "set_captions",
              event.target.value === "off"
                ? { enabled: false }
                : { enabled: true, style: event.target.value },
            )
          }
        >
          <option value="off">Off</option>
          <option value="classic">Classic</option>
          <option value="bold-pop">Bold pop</option>
          <option value="minimal">Minimal</option>
        </select>
        <small className="muted">Generate a transcript in Speech before enabling captions.</small>
      </label>
      <details>
        <summary>Editing templates</summary>
        <div className="stack">
          <button className="btn" type="button" onClick={() => void loadTemplates()}>
            Load editing templates
          </button>
          <label className="field">
            <span className="field__label">Template</span>
            <select
              className="input"
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value);
                setVariables({});
              }}
            >
              <option value="">Choose a template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          {selected?.variables.map((variable) => (
            <label key={variable} className="field">
              <span className="field__label">{variable.replaceAll("_", " ")}</span>
              <input
                className="input"
                value={variables[variable] ?? ""}
                maxLength={280}
                onChange={(event) => setVariables({ ...variables, [variable]: event.target.value })}
              />
            </label>
          ))}
          <button
            type="button"
            className="btn"
            disabled={!online || !selected}
            onClick={() => void controller.run("apply_template", { templateId, variables })}
          >
            Apply template
          </button>
        </div>
      </details>
      <details>
        <summary>Keyboard shortcuts</summary>
        <p className="muted">
          Space: play/pause · S: split · Delete: remove selection · Ctrl+Z: undo · Shift+Ctrl+Z:
          redo · +/-: zoom · Shift+Z: fit timeline · arrows: step frames.
        </p>
      </details>
    </div>
  );
}
