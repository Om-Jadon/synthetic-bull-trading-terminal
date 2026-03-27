# Git & GitHub Guide — SYNTHETIC-BULL Trading Terminal

---

## Repository Structure

```
opensoft-trading-terminal/
├── backend/         # Go backend — matching engine, WebSocket, REST API (complete)
├── ui/              # Your frontend lives here
├── compose.yaml     # Docker Compose — runs the backend
├── .env.example     # Environment variable template
└── README.md        # Project overview
```

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_ORG/opensoft-trading-terminal.git
cd opensoft-trading-terminal
```

### 2. Set up environment

```bash
cp .env.example .env
```

### 3. Start the backend

```bash
docker compose up --build
```

Backend is now running at `http://localhost:8080`. WebSocket at `ws://localhost:8080/ws`.

### 4. Create your team branch

```bash
git checkout -b ui/team-alice
```

Build your frontend inside `ui/`.

---

## Branch Naming

| Purpose | Pattern            | Example             |
| ------- | ------------------ | ------------------- |
| UI team | `ui/team-name`     | `ui/team-alice`     |
| Bug fix | `fix/description`  | `fix/ws-reconnect`  |
| Docs    | `docs/description` | `docs/api-examples` |

---

## Daily Workflow

### Start of day — sync with main

```bash
git checkout main
git pull origin main
git checkout ui/your-team
git merge main          # bring in any updates from main
```

### Make changes and commit

```bash
git status                          # see what changed
git add ui/src/components/Chart.tsx # stage specific file
git add ui/                         # or stage everything in ui/
git commit -m "feat(ui): add candlestick chart"
```

### Push your work

```bash
git push -u origin ui/your-team     # first push
git push                            # after that
```

### Open a Pull Request

1. Go to the repo on GitHub
2. Click **Compare & pull request** on your branch
3. Write a short description of what you built
4. Request a review if needed
5. Merge when approved

### After merging

```bash
git checkout main
git pull origin main
git branch -d ui/your-team          # clean up local branch
```

---

## Commit Message Format

```text
type(scope): short description
```

**Types:** `feat`, `fix`, `test`, `docs`, `refactor`, `chore`

**Scope:** the area you changed — `ui`, `backend`, `api`, `docs`

**Examples:**

```bash
git commit -m "feat(ui): add order book with depth visualization"
git commit -m "fix(ui): correct WebSocket reconnect on disconnect"
git commit -m "feat(ui): animate price ticker flash on update"
git commit -m "docs: update README with setup steps"
```

---

## Essential Commands

```bash
# Check state
git status                  # what's changed?
git log --oneline -10       # last 10 commits
git diff                    # unstaged changes
git diff --staged           # staged changes

# Branches
git branch                  # list local branches
git branch -a               # list all branches including remote
git checkout -b ui/my-team  # create and switch to new branch
git checkout main           # switch to main

# Staging and committing
git add ui/src/App.tsx      # stage one file
git add ui/                 # stage entire folder
git add .                   # stage everything
git commit -m "feat: ..."   # commit with message

# Syncing
git pull origin main        # pull latest main
git push                    # push current branch
git push -u origin ui/name  # push and set upstream (first time)

# Undo
git restore ui/src/App.tsx  # discard uncommitted changes to a file
git restore .               # discard ALL uncommitted changes ⚠️
git reset HEAD~1            # undo last commit, keep changes staged
```

---

## Common Scenarios

### Someone updated main while you were working

```bash
git checkout main
git pull origin main
git checkout ui/your-team
git merge main
# fix any conflicts, then:
git add .
git commit -m "chore: merge latest main"
```

### You committed to the wrong branch

```bash
git log --oneline -3        # copy the commit hash you want to move
git reset HEAD~1            # undo the commit, keep changes
git checkout ui/correct-branch
git add .
git commit -m "feat: ..."   # re-commit on the right branch
```

### You want to see what another team did

```bash

git fetch origin
git log --oneline origin/ui/team-bob   # see their commits
git diff main...origin/ui/team-bob     # diff vs main
```

### Merge conflict

```bash
git merge main
# Git marks conflicts in the file like this:
# <<<<<<< HEAD
# your code
# =======
# their code
# >>>>>>> main

# Open the file, decide what to keep, then:
git add conflicted-file.tsx
git commit -m "chore: resolve merge conflict"
```

### Undo last commit (before pushing)

```bash
git reset HEAD~1            # keeps your changes, unstages them
```

### See who changed a line

```bash
git blame ui/src/App.tsx
```

---

## Testing Before Pushing

```bash
# Backend (already complete, but to verify it still runs):
cd backend && go test ./...

# Your frontend (example for common setups):
cd ui && npm test
cd ui && npm run build      # make sure it builds without errors
```

---

## Quick Cheatsheet

```bash
# Morning
git checkout main && git pull origin main
git checkout ui/your-team && git merge main

# During work
git add . && git commit -m "feat(ui): what you built"

# End of day
git push
```

---

## Need Help?

- **Git docs:** [git-scm.com/doc](https://git-scm.com/doc)
- **Interactive tutorial:** [learngitbranching.js.org](https://learngitbranching.js.org)
- **GitHub docs:** [docs.github.com](https://docs.github.com)
- When stuck: `git status` first, then Google the error message
