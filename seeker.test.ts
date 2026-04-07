import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { isValidCacheDirectory } from "./seeker";

const bin = path.resolve("dist/seeker.js");
const run = (args: string[], cwd = process.cwd()) =>
  spawnSync("node", [bin, ...args], { encoding: "utf-8", cwd });

describe("isValidCacheDirectory", () => {
  const uid = process.getuid!();

  it("accepts a valid owned directory", () => {
    const stats = {
      uid,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    } as any;
    expect(isValidCacheDirectory(stats, uid)).toBe(true);
  });

  it("rejects a symlink", () => {
    const stats = {
      uid,
      isDirectory: () => true,
      isSymbolicLink: () => true,
    } as any;
    expect(isValidCacheDirectory(stats, uid)).toBe(false);
  });

  it("rejects a directory owned by another user", () => {
    const stats = {
      uid: uid + 1,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    } as any;
    expect(isValidCacheDirectory(stats, uid)).toBe(false);
  });

  it("rejects a non-directory", () => {
    const stats = {
      uid,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    } as any;
    expect(isValidCacheDirectory(stats, uid)).toBe(false);
  });
});

describe("CLI", () => {
  it("shows help with no args", () => {
    const r = run([]);
    expect(r.stdout).toContain("seeker —");
    expect(r.status).toBe(0);
  });

  it("shows help with --help", () => {
    const r = run(["--help"]);
    expect(r.stdout).toContain("seeker —");
    expect(r.status).toBe(0);
  });

  describe("search and act", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skr-test-"));
      fs.writeFileSync(path.join(tmpDir, "hello.txt"), "hello world\n");
      fs.writeFileSync(path.join(tmpDir, "other.txt"), "nothing here\n");
    });

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true });
    });

    it("finds files containing a query", () => {
      const r = run(["hello"], tmpDir);
      expect(r.stdout).toContain("hello.txt");
      expect(r.status).toBe(0);
    });

    it("does not list files that don't match", () => {
      const r = run(["hello"], tmpDir);
      expect(r.stdout).not.toContain("other.txt");
    });

    it("cat prints file contents", () => {
      run(["hello"], tmpDir);
      const r = run(["cat", "1"], tmpDir);
      expect(r.stdout).toContain("hello world");
      expect(r.status).toBe(0);
    });

    it("exits non-zero when no results found", () => {
      const r = run(["zzznomatch"], tmpDir);
      expect(r.status).toBe(1);
    });
  });
});
