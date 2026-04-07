#!/usr/bin/env tsx

import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import chalk from "chalk";

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
const accentColor = chalk.green;
const baseColor = chalk.white;

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
    const cmd = ["fd", "--fixed-strings"];
    if (caseInsensitive) cmd.push("--ignore-case");
    cmd.push("--", query);
    return cmd;
  }
  const nameFlag = caseInsensitive ? "-iname" : "-name";
  return ["find", ".", "-not", "-path", "./.git/*", nameFlag, `*${query}*`];
}

function buildGrepCommand(query: string, caseInsensitive: boolean): string[] {
  if (hasCommand("rg")) {
    const cmd = ["rg", "--files-with-matches", "--fixed-strings"];
    if (caseInsensitive) cmd.push("--ignore-case");
    cmd.push("--", query);
    return cmd;
  }
  const cmd = [
    "grep",
    "-rl",
    "--fixed-strings",
    "--exclude-dir=.git",
    "--binary-files=without-match",
  ];
  if (caseInsensitive) cmd.push("-i");
  cmd.push("--", query);
  return cmd;
}

function runSearch(cmd: string[]): string[] {
  const [bin, ...args] = cmd;
  const result = spawnSync(bin, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== null && result.status > 1) {
    console.error(`Search tool error: ${result.stderr.trim()}`);
    process.exit(1);
  }

  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^\.\//, ""));
}

function formatResults(query: string, lines: string[], total: number) {
  const dot = chalk.dim("·");

  console.log(`\n  ${accentColor.bold.inverse(`Results for "${query}"`)}\n`);

  for (let i = 0; i < lines.length; i++) {
    const dir = path.dirname(lines[i]);
    const base = baseColor(path.basename(lines[i]));
    const filePath = dir === "." ? base : `${baseColor.dim(dir + "/")}${base}`;
    console.log(
      `  ${accentColor(String(i + 1).padStart(2))} ${dot} ${filePath}`,
    );
  }

  if (total > lines.length) {
    console.log(
      chalk.dim(
        `\n  … showing ${lines.length} of ${total} results (use -a to show all)`,
      ),
    );
  }
}

function search(
  query: string,
  {
    caseInsensitive = false,
    filenameOnly = false,
    showAll = false,
  }: SearchOptions = {},
) {
  const cmd = filenameOnly
    ? buildFindCommand(query, caseInsensitive)
    : buildGrepCommand(query, caseInsensitive);

  const lines = runSearch(cmd);

  if (lines.length === 0) {
    const mode = filenameOnly ? "filenames matching" : "files containing";
    console.error(`No results for ${mode} "${query}"`);
    process.exit(1);
  }

  const total = lines.length;
  const truncated = !showAll && total > maxResults;
  const displayLines = truncated ? lines.slice(0, maxResults) : lines;

  saveCache(query, displayLines);
  formatResults(query, displayLines, total);
}

function doCat(n: number) {
  const filePath = pickLine(n);
  process.stdout.write(fs.readFileSync(filePath));
}

function doCd(n: number) {
  const filePath = pickLine(n);
  const target = fs.statSync(filePath).isDirectory()
    ? filePath
    : path.dirname(filePath);
  process.stdout.write(target);
}

function doEdit(n: number) {
  const filePath = pickLine(n);
  const [bin, ...editorArgs] = (process.env.EDITOR ?? "vim").split(/\s+/);
  execFileSync(bin, [...editorArgs, filePath], { stdio: "inherit" });
}

function doCopy(n: number) {
  const filePath = pickLine(n);
  const tools = [
    { cmd: "wl-copy", args: [] },
    { cmd: "xclip", args: ["-sel", "clip"] },
    { cmd: "pbcopy", args: [] },
  ];

  const tool = tools.find((t) => hasCommand(t.cmd));
  if (!tool) {
    console.error(
      "No clipboard tool found — install wl-clipboard (Wayland), xclip (X11), or pbcopy (Mac)",
    );
    process.exit(1);
  }

  execFileSync(tool.cmd, tool.args, {
    input: filePath.replace(/ /g, "\\ "),
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log(`Copied: ${filePath}`);
}

function doList(n: number) {
  const filePath = pickLine(n);
  const target = fs.statSync(filePath).isDirectory()
    ? filePath
    : path.dirname(filePath);
  execFileSync("ls", ["-la", target], { stdio: "inherit" });
}

const actions: Record<string, (num: number) => void> = {
  cat: doCat,
  cd: doCd,
  edit: doEdit,
  copy: doCopy,
  ls: doList,
};

function printHelp() {
  console.log(`
  ${accentColor.bold.inverse(" seeker — search files and content; act by line number ")}

  ${accentColor("search:")}
    skr <query>              search file contents
    skr -i <query>           case insensitive
    skr -f <query>           search file names instead of contents
    skr -a <query>           show all results (no cap)
    skr -i -f <query>        case insensitive filename search
    skr web proxy notes      multi-word query (no quotes needed)

  ${accentColor("act on results:")}
    skr cat <n>              print file #n
    skr cd <n>               cd into dir of file #n
    skr edit <n>             open file #n in $EDITOR
    skr copy <n>             copy path of file #n to clipboard
    skr ls <n>               list contents of dir of file #n
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || ["-h", "--help", "-help"].includes(args[0])) {
    printHelp();
    return;
  }

  if (args.length === 2 && args[0] in actions) {
    const num = Number(args[1]);
    if (!Number.isInteger(num)) {
      console.error(`Expected a number, got "${args[1]}"`);
      process.exit(1);
    }
    actions[args[0]](num);
    return;
  }

  let caseInsensitive = false;
  let filenameOnly = false;
  let showAll = false;
  const queryParts: string[] = [];

  for (const arg of args) {
    switch (arg) {
      case "-i":
        caseInsensitive = true;
        break;
      case "-f":
        filenameOnly = true;
        break;
      case "-a":
        showAll = true;
        break;
      default:
        queryParts.push(arg);
    }
  }

  if (queryParts.length === 0) {
    printHelp();
    return;
  }

  search(queryParts.join(" "), { caseInsensitive, filenameOnly, showAll });
}

main();
