/**
 * Git Explainer — plain-English explanations for common git commands and errors.
 * 100% client-side: nothing is ever uploaded.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <label class="field-label" for="ge-input">Paste a git command or error message</label>
  <textarea id="ge-input" class="editor" rows="4" spellcheck="false"
    placeholder="git rebase -i HEAD~3\nfatal: refusing to merge unrelated histories"></textarea>

  <div class="toolbar">
    <button id="ge-explain" class="btn btn-primary" type="button">Explain</button>
    <button id="ge-clear" class="btn" type="button">Clear</button>
    <span id="status" class="status" role="status"></span>
  </div>

  <div class="grid-2" style="margin-top:.5rem">
    <div>
      <label class="field-label">Examples (click to try)</label>
      <div id="ge-examples" class="out out-wrap" style="cursor:pointer;min-height:180px"></div>
    </div>
    <div>
      <label class="field-label">Explanation</label>
      <div id="ge-output" class="out out-wrap" style="min-height:180px"></div>
    </div>
  </div>
</div>
`;

const SCRIPT = `
(function () {
  var input = document.getElementById('ge-input');
  var out = document.getElementById('ge-output');
  var examples = document.getElementById('ge-examples');
  var status = document.getElementById('status');
  var explainBtn = document.getElementById('ge-explain');
  var clearBtn = document.getElementById('ge-clear');

  function setStatus(msg, ok) {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('status-ok', !!ok);
    status.classList.toggle('status-err', !ok);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Command dictionary: pattern → { title, what, parts[], warnings[] }
  var COMMANDS = [
    { re: /^git\s+status$/i, title: 'git status',
      what: 'Show the state of the working directory and the staging area.',
      parts: [['status', 'which files are staged, modified or untracked']],
      warnings: ['Safe — read-only.'] },
    { re: /^git\s+log(\s|$)/i, title: 'git log',
      what: 'Show commit history.',
      parts: [['log', 'walk back through commits from HEAD']],
      warnings: ['Safe — read-only.'] },
    { re: /^git\s+diff(\s|$)/i, title: 'git diff',
      what: 'Show changes between working tree, index and commits.',
      parts: [['diff', 'unified patch of differences']],
      warnings: ['Safe — read-only.'] },
    { re: /^git\s+add\s+(.+)$/i, title: 'git add',
      what: 'Stage changes so they will be part of the next commit.',
      parts: [['add', 'move changes from working tree into the index']],
      warnings: ['git add . / -A stages everything — check status first.'] },
    { re: /^git\s+commit(\s|$)/i, title: 'git commit',
      what: 'Record staged changes as a new commit.',
      parts: [['-m "msg"', 'inline commit message'], ['-a', 'also stage tracked modified files'], ['--amend', 'rewrite the previous commit']],
      warnings: ['--amend rewrites history — dangerous after a push.'] },
    { re: /^git\s+push(\s|$)/i, title: 'git push',
      what: 'Upload local commits to a remote branch.',
      parts: [['origin main', 'remote name + branch'], ['-u', 'set upstream so plain git push works later'], ['--force / -f', 'overwrite remote history']],
      warnings: ['--force can destroy commits on the remote.'] },
    { re: /^git\s+pull(\s|$)/i, title: 'git pull',
      what: 'Fetch from remote and merge (or rebase) into current branch.',
      parts: [['--rebase', 'rebase local commits on top of remote instead of merging']],
      warnings: ['Can create merge commits — prefer --rebase if you keep a linear history.'] },
    { re: /^git\s+fetch(\s|$)/i, title: 'git fetch',
      what: 'Download objects and refs from a remote without merging.',
      parts: [['origin', 'remote to fetch from']],
      warnings: ['Safe — only updates remote-tracking refs.'] },
    { re: /^git\s+checkout\s+(-b\s+)?(\S+)/i, title: 'git checkout / switch',
      what: 'Switch branches or restore files.',
      parts: [['-b <name>', 'create and switch to a new branch'], ['-- <file>', 'restore a file from HEAD']],
      warnings: ['checkout <file> discards uncommitted changes to that file.'] },
    { re: /^git\s+switch(\s|$)/i, title: 'git switch',
      what: 'Modern way to change branches (git >= 2.23).',
      parts: [['-c <name>', 'create and switch'], ['-', 'switch back to previous branch']],
      warnings: ['Safe unless you have uncommitted changes that conflict.'] },
    { re: /^git\s+branch(\s|$)/i, title: 'git branch',
      what: 'List, create or delete branches.',
      parts: [['<name>', 'create branch at HEAD'], ['-d / -D', 'delete merged / force delete'], ['-m', 'rename current branch']],
      warnings: ['-D deletes even unmerged branches.'] },
    { re: /^git\s+merge(\s|$)/i, title: 'git merge',
      what: 'Join two or more development histories together.',
      parts: [['<branch>', 'branch to merge into current'], ['--no-ff', 'always create a merge commit']],
      warnings: ['Merge conflicts leave markers in files — resolve before committing.'] },
    { re: /^git\s+rebase(\s|$)/i, title: 'git rebase',
      what: 'Reapply commits on top of another base tip.',
      parts: [['-i HEAD~N', 'interactive: squash/reword/drop last N commits'], ['--abort', 'cancel a rebase in progress']],
      warnings: ['Rewrites history — never rebase pushed public branches.'] },
    { re: /^git\s+reset(\s|$)/i, title: 'git reset',
      what: 'Move HEAD and optionally unstage / discard changes.',
      parts: [['--soft', 'keep changes staged'], ['--mixed (default)', 'unstage but keep working tree'], ['--hard', 'discard everything']],
      warnings: ['--hard is destructive — uncommitted work is gone.'] },
    { re: /^git\s+revert(\s|$)/i, title: 'git revert',
      what: 'Create a new commit that undoes a previous one (safe on shared history).',
      parts: [['<commit>', 'commit to invert']],
      warnings: ['Preferred over reset on public branches.'] },
    { re: /^git\s+stash(\s|$)/i, title: 'git stash',
      what: 'Temporarily shelve uncommitted changes.',
      parts: [['push -m "msg"', 'save with a message'], ['pop', 'restore and drop'], ['list', 'show stashes']],
      warnings: ['Stashes can be forgotten — remember to pop.'] },
    { re: /^git\s+cherry-pick(\s|$)/i, title: 'git cherry-pick',
      what: 'Apply a single commit from another branch.',
      parts: [['<hash>', 'commit to copy'], ['--continue / --abort', 'resume or cancel on conflict']],
      warnings: ['Duplicates commits — hashes differ from the original.'] },
    { re: /^git\s+remote(\s|$)/i, title: 'git remote',
      what: 'Manage remote repositories.',
      parts: [['-v', 'list remotes with URLs'], ['add <name> <url>', 'register a new remote']],
      warnings: ['Safe.'] },
    { re: /^git\s+clone(\s|$)/i, title: 'git clone',
      what: 'Download a repository and check out a working copy.',
      parts: [['<url>', 'remote to clone'], ['--depth 1', 'shallow clone (faster, less history)']],
      warnings: ['Safe.'] },
    { re: /^git\s+init(\s|$)/i, title: 'git init',
      what: 'Create an empty git repository in the current folder.',
      parts: [['-b main', 'set the initial branch name']],
      warnings: ['Safe.'] },
    { re: /^git\s+config(\s|$)/i, title: 'git config',
      what: 'Get or set repository / global git options.',
      parts: [['--global', 'apply to all repos'], ['user.name / user.email', 'commit identity']],
      warnings: ['Safe.'] },
    { re: /^git\s+tag(\s|$)/i, title: 'git tag',
      what: 'Create, list or delete tags (usually for releases).',
      parts: [['-a v1.0 -m "msg"', 'annotated tag'], ['-d', 'delete tag']],
      warnings: ['Deleting a pushed tag needs a force push to the remote.'] },
    { re: /^git\s+clean(\s|$)/i, title: 'git clean',
      what: 'Remove untracked files from the working tree.',
      parts: [['-n', 'dry-run — list what would go'], ['-fd', 'force delete untracked files and folders']],
      warnings: ['-fd is destructive — no recovery without backup.'] },
  ];

  var ERRORS = [
    { re: /refusing to merge unrelated histories/i,
      title: 'refusing to merge unrelated histories',
      what: 'You tried to merge/pull two repos that do not share a common commit.',
      fix: 'git pull origin main --allow-unrelated-histories',
      notes: ['Common when you init a repo locally and then connect a remote that already has commits.'] },
    { re: /failed to push some refs|non-fast-forward/i,
      title: 'failed to push (non-fast-forward)',
      what: 'The remote has commits you do not have locally.',
      fix: 'git pull --rebase origin main   # then push again',
      notes: ['Avoid git push --force unless you know exactly what you are doing.'] },
    { re: /merge conflict in (.+)/i,
      title: 'merge conflict',
      what: 'Git could not auto-merge some files.',
      fix: 'Open the listed files, resolve <<<<<<< ======= >>>>>>> markers, git add <file>, then git commit (or git rebase --continue).',
      notes: ['Use git status to see remaining unmerged files.'] },
    { re: /you have divergent branches/i,
      title: 'divergent branches',
      what: 'Local and remote branches have different commits and git needs a strategy.',
      fix: 'git config pull.rebase true   # preferred, or:',
      notes: ['Alternatively: git config pull.ff only (only fast-forward merges).'] },
    { re: /please tell me who you are|unable to auto-detect email/i,
      title: 'missing user.name / user.email',
      what: 'Git does not know who is making the commit.',
      fix: 'git config --global user.name "Your Name" && git config --global user.email "you@example.com"',
      notes: ['Set once per machine.'] },
    { re: /not a git repository/i,
      title: 'not a git repository',
      what: 'You are running git outside of any repo.',
      fix: 'cd into the project, or git init to create a new repo.',
      notes: [] },
    { re: /pathspec '(.+)' did not match/i,
      title: 'pathspec did not match',
      what: 'The file or pattern you referenced does not exist in the working tree or index.',
      fix: 'git status   # see what files exist; check spelling / case',
      notes: [] },
    { re: /detached head/i,
      title: 'detached HEAD',
      what: 'HEAD points to a commit rather than a branch.',
      fix: 'git switch -c <new-branch>   # keep work, or git switch <existing-branch>',
      notes: ['Commits made in detached HEAD are not on any branch and can be lost.'] },
    { re: /your local changes.+would be overwritten/i,
      title: 'local changes would be overwritten',
      what: 'A checkout / pull would overwrite your uncommitted edits.',
      fix: 'git stash   # or commit, then retry the operation',
      notes: [] },
    { re: /fatal: not possible to fast-forward/i,
      title: 'not possible to fast-forward',
      what: 'A pull with --ff-only was requested but the branch has diverged.',
      fix: 'git pull --rebase   # or drop --ff-only',
      notes: [] },
  ];

  var EXAMPLES = [
    'git status',
    'git add .',
    'git commit -m "fix: typo"',
    'git push origin main',
    'git rebase -i HEAD~3',
    'git reset --hard HEAD~1',
    'fatal: refusing to merge unrelated histories',
    'error: failed to push some refs',
    'CONFLICT (content): Merge conflict in src/app.ts',
    'fatal: not a git repository',
  ];

  function explain(text) {
    var t = String(text || '').trim();
    if (!t) { out.innerHTML = '<span class="muted">Paste a command or error above.</span>'; setStatus('', true); return; }

    var lines = t.split(/\r?\n/).filter(function (l) { return l.trim(); });
    var html = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      html.push('<div style="margin-bottom:.75rem">');
      html.push('<div><code>' + esc(line) + '</code></div>');

      var hit = null;
      // Try commands first
      for (var c = 0; c < COMMANDS.length; c++) {
        if (COMMANDS[c].re.test(line)) { hit = { kind: 'cmd', obj: COMMANDS[c] }; break; }
      }
      // Then errors
      if (!hit) {
        for (var e = 0; e < ERRORS.length; e++) {
          if (ERRORS[e].re.test(line)) { hit = { kind: 'err', obj: ERRORS[e] }; break; }
        }
      }

      if (!hit) {
        html.push('<div class="muted">No match in local dictionary. Nothing is sent to a server.</div>');
      } else if (hit.kind === 'cmd') {
        var c = hit.obj;
        html.push('<div><b>' + esc(c.title) + '</b></div>');
        html.push('<div>' + esc(c.what) + '</div>');
        if (c.parts && c.parts.length) {
          html.push('<div style="margin-top:.3rem"><span class="muted">flags:</span></div><ul style="margin:.2rem 0 .2rem 1.1rem">');
          for (var p = 0; p < c.parts.length; p++) {
            html.push('<li><code>' + esc(c.parts[p][0]) + '</code> — ' + esc(c.parts[p][1]) + '</li>');
          }
          html.push('</ul>');
        }
        if (c.warnings && c.warnings.length) {
          html.push('<div style="color:#ffb454">⚠ ' + esc(c.warnings.join(' ')) + '</div>');
        }
      } else {
        var er = hit.obj;
        html.push('<div><b>' + esc(er.title) + '</b></div>');
        html.push('<div>' + esc(er.what) + '</div>');
        html.push('<div style="margin-top:.3rem"><span class="muted">fix:</span> <code>' + esc(er.fix) + '</code></div>');
        if (er.notes && er.notes.length) {
          html.push('<div class="muted" style="margin-top:.2rem">' + esc(er.notes.join(' ')) + '</div>');
        }
      }
      html.push('</div>');
    }
    out.innerHTML = html.join('');
    setStatus('Explained', true);
  }

  // Render examples list
  var exHtml = '';
  for (var i = 0; i < EXAMPLES.length; i++) {
    exHtml += '<div data-ex="' + esc(EXAMPLES[i]) + '" style="padding:.2rem 0;border-bottom:1px dashed #234">' + esc(EXAMPLES[i]) + '</div>';
  }
  examples.innerHTML = exHtml;
  examples.addEventListener('click', function (e) {
    var el = e.target.closest('[data-ex]');
    if (!el) return;
    var v = el.getAttribute('data-ex');
    input.value = v;
    explain(v);
  });

  if (explainBtn) explainBtn.addEventListener('click', function () { explain(input.value); });
  if (clearBtn) clearBtn.addEventListener('click', function () {
    input.value = '';
    out.innerHTML = '';
    setStatus('', true);
  });
  if (input) input.addEventListener('input', function () { explain(input.value); });

  explain('git status');
})();
`;

export function gitExplainerPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "git-explainer",
    title: "Git Explainer",
    intro:
      "Paste any git command or error message and get a plain-English explanation, flag breakdown and safe fix suggestions. The dictionary ships with the page — nothing is sent to a server.",
    howToUse: [
      "Paste a git command or an error message.",
      "Read the plain-English explanation and a flag-by-flag breakdown.",
      "Follow the safe fix suggestions when something went wrong.",
    ],
    useCases: [
      "Understanding an unfamiliar git error before you act.",
      "Learning what flags like <code>--amend</code> or <code>--rebase</code> really do.",
      "Onboarding teammates who are new to git.",
    ],
    body: BODY,
    script: SCRIPT,
  });
}
