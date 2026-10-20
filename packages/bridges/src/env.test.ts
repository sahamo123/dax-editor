// Tests for the child environment allow-list: credentials never pass, config and network settings do.

import { describe, expect, it } from "vitest";
import { buildChildEnv } from "./env.js";

describe("buildChildEnv", () => {
  it("drops credential-shaped variables so a stray key can neither leak nor change billing", () => {
    const env = buildChildEnv({
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "sk-ant-secret",
      ANTHROPIC_AUTH_TOKEN: "tok",
      CLAUDE_CODE_OAUTH_TOKEN: "oauth",
      OPENAI_API_KEY: "sk-openai",
      CODEX_API_KEY: "codex",
      GEMINI_API_KEY: "gem",
      AWS_SECRET_ACCESS_KEY: "aws",
      GITHUB_TOKEN: "gh",
      DAX_SERVER_TOKEN: "server",
    });
    expect(Object.keys(env).sort()).toEqual(["NO_COLOR", "NO_PROXY", "PATH", "no_proxy"]);
  });

  it("keeps what the CLI needs to find its own login and to reach the network", () => {
    const env = buildChildEnv({
      PATH: "/usr/bin",
      HOME: "/home/u",
      LANG: "en_US.UTF-8",
      LC_ALL: "C",
      CLAUDE_CONFIG_DIR: "/home/u/.cfg",
      HTTPS_PROXY: "http://proxy:3128",
      SSL_CERT_FILE: "/etc/ca.pem",
      NODE_EXTRA_CA_CERTS: "/etc/extra.pem",
      XDG_CONFIG_HOME: "/home/u/.config",
    });
    expect(env).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/home/u",
      LANG: "en_US.UTF-8",
      LC_ALL: "C",
      CLAUDE_CONFIG_DIR: "/home/u/.cfg",
      HTTPS_PROXY: "http://proxy:3128",
      SSL_CERT_FILE: "/etc/ca.pem",
      NODE_EXTRA_CA_CERTS: "/etc/extra.pem",
      XDG_CONFIG_HOME: "/home/u/.config",
    });
  });

  it("matches names case-insensitively, as Windows does", () => {
    expect(buildChildEnv({ Path: "C:\\bin", ApiKey: "x" })).toMatchObject({ Path: "C:\\bin" });
    expect(buildChildEnv({ Path: "C:\\bin", ApiKey: "x" })).not.toHaveProperty("ApiKey");
  });

  it("adds our own values on top, and they win", () => {
    const env = buildChildEnv(
      { PATH: "/a", HOME: "/h" },
      { DAX_MCP_TOKEN: "t0ken-value", PATH: "/b" },
    );
    expect(env.DAX_MCP_TOKEN).toBe("t0ken-value");
    expect(env.PATH).toBe("/b");
  });

  it("always exempts the loopback interface from proxies, keeping the user's own list", () => {
    expect(buildChildEnv({ PATH: "/a" }).NO_PROXY).toBe("127.0.0.1,localhost,::1");
    const env = buildChildEnv({ PATH: "/a", NO_PROXY: "corp.example" });
    expect(env.NO_PROXY).toBe("corp.example,127.0.0.1,localhost,::1");
    expect(env.no_proxy).toBe(env.NO_PROXY);
  });

  it("ignores undefined values", () => {
    expect(buildChildEnv({ PATH: undefined })).not.toHaveProperty("PATH");
  });
});
