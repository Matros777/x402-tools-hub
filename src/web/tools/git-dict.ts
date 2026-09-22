/**
 * Git dictionary — shared data source for the Git Explainer.
 *
 * Every entry stores its regex as a `pattern` string + `flags` so the same
 * data can be serialised to JSON (browser page) AND recompiled on the server.
 * The server handler /api/git-explainer uses `explainGit()` directly.
 */

export type GitEntryKind = "cmd" | "err";

export interface GitEntry {
  kind: GitEntryKind;
  pattern: string;
  flags: string;
  title: string;
  what: string;
  parts?: [string, string][];
  warnings?: string[];
  fix?: string;
  notes?: string[];
}

export const GIT_COMMANDS: GitEntry[] = [
  { kind: "cmd", pattern: "^git\\s+status$", flags: "i", title: "git status",
    what: "Show the state of the working directory and the staging area.",
    parts: [["status", "which files are staged, modified or untracked"]],
    warnings: ["Safe — read-only."] },
  { kind: "cmd", pattern: "^git\\s+log(\\s|$)", flags: "i", title: "git log",
    what: "Show commit history.",
    parts: [["log", "walk back through commits from HEAD"]],
    warnings: ["Safe — read-only."] },
  { kind: "cmd", pattern: "^git\\s+diff(\\s|$)", flags: "i", title: "git diff",
    what: "Show changes between working tree, index and commits.",
    parts: [["diff", "unified patch of differences"]],
    warnings: ["Safe — read-only."] },
  { kind: "cmd", pattern: "^git\\s+add\\s+(.+)$", flags: "i", title: "git add",
    what: "Stage changes so they will be part of the next commit.",
    parts: [["add", "move changes from working tree into the index"]],
    warnings: ["git add . / -A stages everything — check status first."] },
  { kind: "cmd", pattern: "^git\\s+commit(\\s|$)", flags: "i", title: "git commit",
    what: "Record staged changes as a new commit.",
    parts: [["-m \"msg\"", "inline commit message"], ["-a", "also stage tracked modified files"], ["--amend", "rewrite the previous commit"]],
    warnings: ["--amend rewrites history — dangerous after a push."] },
  { kind: "cmd", pattern: "^git\\s+push(\\s|$)", flags: "i", title: "git push",
    what: "Upload local commits to a remote branch.",
    parts: [["origin main", "remote name + branch"], ["-u", "set upstream so plain git push works later"], ["--force / -f", "overwrite remote history"]],
    warnings: ["--force can destroy commits on the remote."] },
  { kind: "cmd", pattern: "^git\\s+pull(\\s|$)", flags: "i", title: "git pull",
    what: "Fetch from remote and merge (or rebase) into current branch.",
    parts: [["--rebase", "rebase local commits on top of remote instead of merging"]],
    warnings: ["Can create merge commits — prefer --rebase if you keep a linear history."] },
  { kind: "cmd", pattern: "^git\\s+fetch(\\s|$)", flags: "i", title: "git fetch",
    what: "Download objects and refs from a remote without merging.",
    parts: [["origin", "remote to fetch from"]],
    warnings: ["Safe — only updates remote-tracking refs."] },
  { kind: "cmd", pattern: "^git\\s+checkout\\s+(-b\\s+)?(\\S+)", flags: "i", title: "git checkout / switch",
    what: "Switch branches or restore files.",
    parts: [["-b <name>", "create and switch to a new branch"], ["-- <file>", "restore a file from HEAD"]],
    warnings: ["checkout <file> discards uncommitted changes to that file."] },
  { kind: "cmd", pattern: "^git\\s+switch(\\s|$)", flags: "i", title: "git switch",
    what: "Modern way to change branches (git >= 2.23).",
    parts: [["-c <name>", "create and switch"], ["-", "switch back to previous branch"]],
    warnings: ["Safe unless you have uncommitted changes that conflict."] },
  { kind: "cmd", pattern: "^git\\s+branch(\\s|$)", flags: "i", title: "git branch",
    what: "List, create or delete branches.",
    parts: [["<name>", "create branch at HEAD"], ["-d / -D", "delete merged / force delete"], ["-m", "rename current branch"]],
    warnings: ["-D deletes even unmerged branches."] },
  { kind: "cmd", pattern: "^git\\s+merge(\\s|$)", flags: "i", title: "git merge",
    what: "Join two or more development histories together.",
    parts: [["<branch>", "branch to merge into current"], ["--no-ff", "always create a merge commit"]],
    warnings: ["Merge conflicts leave markers in files — resolve before committing."] },
  { kind: "cmd", pattern: "^git\\s+rebase(\\s|$)", flags: "i", title: "git rebase",
    what: "Reapply commits on top of another base tip.",
    parts: [["-i HEAD~N", "interactive: squash/reword/drop last N commits"], ["--abort", "cancel a rebase in progress"]],
    warnings: ["Rewrites history — never rebase pushed public branches."] },
  { kind: "cmd", pattern: "^git\\s+reset(\\s|$)", flags: "i", title: "git reset",
    what: "Move HEAD and optionally unstage / discard changes.",
    parts: [["--soft", "keep changes staged"], ["--mixed (default)", "unstage but keep working tree"], ["--hard", "discard everything"]],
    warnings: ["--hard is destructive — uncommitted work is gone."] },
  { kind: "cmd", pattern: "^git\\s+revert(\\s|$)", flags: "i", title: "git revert",
    what: "Create a new commit that undoes a previous one (safe on shared history).",
    parts: [["<commit>", "commit to invert"]],
    warnings: ["Preferred over reset on public branches."] },
  { kind: "cmd", pattern: "^git\\s+stash(\\s|$)", flags: "i", title: "git stash",
    what: "Temporarily shelve uncommitted changes.",
    parts: [["push -m \"msg\"", "save with a message"], ["pop", "restore and drop"], ["list", "show stashes"]],
    warnings: ["Stashes can be forgotten — remember to pop."] },
  { kind: "cmd", pattern: "^git\\s+cherry-pick(\\s|$)", flags: "i", title: "git cherry-pick",
    what: "Apply a single commit from another branch.",
    parts: [["<hash>", "commit to copy"], ["--continue / --abort", "resume or cancel on conflict"]],
    warnings: ["Duplicates commits — hashes differ from the original."] },
  { kind: "cmd", pattern: "^git\\s+remote(\\s|$)", flags: "i", title: "git remote",
    what: "Manage remote repositories.",
    parts: [["-v", "list remotes with URLs"], ["add <name> <url>", "register a new remote"]],
    warnings: ["Safe."] },
  { kind: "cmd", pattern: "^git\\s+clone(\\s|$)", flags: "i", title: "git clone",
    what: "Download a repository and check out a working copy.",
    parts: [["<url>", "remote to clone"], ["--depth 1", "shallow clone (faster, less history)"]],
    warnings: ["Safe."] },
  { kind: "cmd", pattern: "^git\\s+init(\\s|$)", flags: "i", title: "git init",
    what: "Create an empty git repository in the current folder.",
    parts: [["-b main", "set the initial branch name"]],
    warnings: ["Safe."] },
  { kind: "cmd", pattern: "^git\\s+config(\\s|$)", flags: "i", title: "git config",
    what: "Get or set repository / global git options.",
    parts: [["--global", "apply to all repos"], ["user.name / user.email", "commit identity"]],
    warnings: ["Safe."] },
  { kind: "cmd", pattern: "^git\\s+tag(\\s|$)", flags: "i", title: "git tag",
    what: "Create, list or delete tags (usually for releases).",
    parts: [["-a v1.0 -m \"msg\"", "annotated tag"], ["-d", "delete tag"]],
    warnings: ["Deleting a pushed tag needs a force push to the remote."] },
  { kind: "cmd", pattern: "^git\\s+clean(\\s|$)", flags: "i", title: "git clean",
    what: "Remove untracked files from the working tree.",
    parts: [["-n", "dry-run — list what would go"], ["-fd", "force delete untracked files and folders"]],
    warnings: ["-fd is destructive — no recovery without backup."] },
];

export const GIT_ERRORS: GitEntry[] = [
  { kind: "err", pattern: "refusing to merge unrelated histories", flags: "i",
    title: "refusing to merge unrelated histories",
    what: "You tried to merge/pull two repos that do not share a common commit.",
    fix: "git pull origin main --allow-unrelated-histories",
    notes: ["Common when you init a repo locally and then connect a remote that already has commits."] },
  { kind: "err", pattern: "failed to push some refs|non-fast-forward", flags: "i",
    title: "failed to push (non-fast-forward)",
    what: "The remote has commits you do not have locally.",
    fix: "git pull --rebase origin main   # then push again",
    notes: ["Avoid git push --force unless you know exactly what you are doing."] },
  { kind: "err", pattern: "merge conflict in (.+)", flags: "i",
    title: "merge conflict",
    what: "Git could not auto-merge some files.",
    fix: "Open the listed files, resolve <<<<<<< ======= >>>>>>> markers, git add <file>, then git commit (or git rebase --continue).",
    notes: ["Use git status to see remaining unmerged files."] },
  { kind: "err", pattern: "you have divergent branches", flags: "i",
    title: "divergent branches",
    what: "Local and remote branches have different commits and git needs a strategy.",
    fix: "git config pull.rebase true   # preferred, or:",
    notes: ["Alternatively: git config pull.ff only (only fast-forward merges)."] },
  { kind: "err", pattern: "please tell me who you are|unable to auto-detect email", flags: "i",
    title: "missing user.name / user.email",
    what: "Git does not know who is making the commit.",
    fix: "git config --global user.name \"Your Name\" && git config --global user.email \"you@example.com\"",
    notes: ["Set once per machine."] },
  { kind: "err", pattern: "not a git repository", flags: "i",
    title: "not a git repository",
    what: "You are running git outside of any repo.",
    fix: "cd into the project, or git init to create a new repo.",
    notes: [] },
  { kind: "err", pattern: "pathspec '(.+)' did not match", flags: "i",
    title: "pathspec did not match",
    what: "The file or pattern you referenced does not exist in the working tree or index.",
    fix: "git status   # see what files exist; check spelling / case",
    notes: [] },
  { kind: "err", pattern: "detached head", flags: "i",
    title: "detached HEAD",
    what: "HEAD points to a commit rather than a branch.",
    fix: "git switch -c <new-branch>   # keep work, or git switch <existing-branch>",
    notes: ["Commits made in detached HEAD are not on any branch and can be lost."] },
  { kind: "err", pattern: "your local changes.+would be overwritten", flags: "i",
    title: "local changes would be overwritten",
    what: "A checkout / pull would overwrite your uncommitted edits.",
    fix: "git stash   # or commit, then retry the operation",
    notes: [] },
  { kind: "err", pattern: "fatal: not possible to fast-forward", flags: "i",
    title: "not possible to fast-forward",
    what: "A pull with --ff-only was requested but the branch has diverged.",
    fix: "git pull --rebase   # or drop --ff-only",
    notes: [] },
];

export interface GitExplanation {
  line: string;
  matched: boolean;
  kind?: GitEntryKind;
  title?: string;
  what?: string;
  parts?: [string, string][];
  warnings?: string[];
  fix?: string;
  notes?: string[];
}

/** Split the input into lines, match each against the dictionary. */
export function explainGit(text: string): GitExplanation[] {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const out: GitExplanation[] = [];
  for (const line of lines) {
    let hit: GitEntry | undefined;
    for (const e of GIT_COMMANDS) {
      if (new RegExp(e.pattern, e.flags).test(line)) { hit = e; break; }
    }
    if (!hit) {
      for (const e of GIT_ERRORS) {
        if (new RegExp(e.pattern, e.flags).test(line)) { hit = e; break; }
      }
    }
    if (!hit) {
      out.push({ line, matched: false });
      continue;
    }
    out.push({
      line,
      matched: true,
      kind: hit.kind,
      title: hit.title,
      what: hit.what,
      parts: hit.parts,
      warnings: hit.warnings,
      fix: hit.fix,
      notes: hit.notes,
    });
  }
  return out;
}
