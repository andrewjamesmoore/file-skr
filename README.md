# file-skr

Search files and content and act on results by line number. Inspired by Metasploit's `search` / `use` workflow.

```
skr <query>       → numbered list of results
skr <action> <n>  → do something with result #n
```

No pipes, no `xargs`, no copy-pasting paths.

## install

```bash
npm install -g file-skr
```

Uses `rg` / `fd` if available, falls back to `grep` / `find`.

## usage

**search file contents**

```bash
skr useEffect
skr -i useeffect          # case insensitive
skr web proxy notes       # multi-word, no quotes needed
skr -a TODO               # show all results (default cap is 100)
```

**search filenames**

```bash
skr -f migration
skr -i -f readme
```

**act on a result**

```bash
skr cat 3       # print file #3
skr edit 3      # open in $EDITOR
skr cd 3        # print the directory (pipe to cd)
skr copy 3      # copy path to clipboard
skr ls 3        # ls the directory
```

Results are cached after each search, so actions always target the last search.

## example

```
$ skr AuthContext

  Results for "AuthContext"

   1 · src/context/AuthContext.tsx
   2 · src/hooks/useAuth.ts
   3 · src/components/ProtectedRoute.tsx

$ skr edit 1
```

---

> A Node CLI written in TS.
