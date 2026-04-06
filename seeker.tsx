#!/usr/bin/env tsx

import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

interface Cache {
  query: string;
  results: string[];
}

interface SearchOptions {
  caseInsensitive?: boolean;
  filenameOnly?: boolean;
  showAll?: boolean;
}

const maxResults = 50;

if (!process.getuid) {
  throw new Error("File system is not supported.");
}

const cacheDirectory = `/tmp/seeker/${process.getuid()}`;
const cacheFile = `${cacheDirectory}/results.json`;

function isValidCacheDirectory(stats: fs.Stats, uid: number): boolean {
  return stats.uid === uid && stats.isDirectory() && !stats.isSymbolicLink();
}

function ensureCacheDirectory() {
  fs.mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
  const stats = fs.lstatSync(cacheDirectory);
  const uid = process.getuid!();
  if (!isValidCacheDirectory(stats, uid)) {
    throw new Error(
      `Error: ${cacheDirectory} is not a safe directory. It's possible this directory is a symbolic link or owned by someone else.`,
    );
  }
}

function saveCache(query: string, results: string[]) {
  ensureCacheDirectory();
  fs.writeFileSync(cacheFile, JSON.stringify({ query, results }, null, 2));
}

function loadCache(): Cache {
  if (!fs.existsSync(cacheFile)) {
    console.error("No previous search - run: skr <query> to get started");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as Cache;
}

function pickLine(num: number): string {
  const cache = loadCache();
  const results = cache.results;
  if (num < 1 || num > results.length) {
    console.error(`Number ${num} out of range (1-${results.length})`);
    process.exit(1);
  }
  return results[num - 1];
}

function hasCommand(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function buildFindCommand(query: string, caseInsensitive: boolean): string[] {
  if (hasCommand("fd")) {
    const cmd = ["fd", query];
    if (caseInsensitive) cmd.push("--ignore-case");
    return cmd;
  }
  const nameFlag = caseInsensitive ? "-iname" : "-name";
  return ["find", ".", "-not", "-path", "./.git/*", nameFlag, `*${query}*`];
}

function buildGrepCommand(query: string, caseInsensitive: boolean): string[] {
  if (hasCommand("rg")) {
    const cmd = ["rg", "--files-with-matches"];
    if (caseInsensitive) cmd.push("--ignore-case");
    cmd.push(query);
    return cmd;
  }
  const cmd = [
    "grep",
    "-rl",
    "--exclude-dir=.git",
    "--binary-files=without-match",
  ];
  if (caseInsensitive) cmd.push("-i");
  cmd.push(query);
  return cmd;
}
