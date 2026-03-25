# Git Quick Reference — NEXTBULL Trading Terminal

**Working directory:** `/home/jadon/Programming/open-soft/opensoft-trading-terminal/`

---

## Project Structure

```
opensoft-trading-terminal/
├── backend/         # Phase 1: Go matching engine + GBM + WebSocket
├── frontend/        # Phase 2: Next.js trading terminal
├── bots/            # Phase 3: Python market maker + alpha bot
├── docs/superpowers/
│   ├── specs/       # Design specifications
│   └── plans/       # Implementation plans
├── PS.md            # Competition problem statement
├── plan.md          # Project roadmap
└── compose.yaml     # Docker Compose
```

---

## First-Time Setup

```bash
# Configure Git
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Initialize repository (if needed)
cd /home/jadon/Programming/open-soft/opensoft-trading-terminal
git init
git add .
git commit -m "chore: initial project structure"

# Connect to GitHub (if needed)
git remote add origin https://github.com/YOUR_USERNAME/opensoft-trading-terminal.git
git push -u origin main
```

---

## Daily Workflow

### 1. Start work on a new task

```bash
git checkout main
git pull origin main
git checkout -b phase1/task-N-description
```

**Branch naming:**
- `phase1/task-N-description` — Backend (e.g., `phase1/task-3-orderbook`)
- `phase2/component-name` — Frontend (e.g., `phase2/candlestick-chart`)
- `phase3/bot-name` — Bots (e.g., `phase3/market-maker`)
- `fix/bug-description` — Bug fixes
- `docs/what-changed` — Documentation

### 2. Make changes and commit

```bash
git status                           # See what changed
git add .                            # Stage all changes
git commit -m "feat(engine): implement order book"
```

**Commit format:** `type(scope): description`

**Types:** `feat`, `fix`, `test`, `docs`, `refactor`, `chore`

**Scopes:** `engine`, `generator`, `hub`, `api`, `ui`, `bots`, `plan`, `spec`

**Examples:**
```
feat(engine): implement BTree-based order book
fix(hub): prevent slow clients from blocking broadcast
test(matcher): add price-time priority test cases
docs(plan): add Phase 2 tasks
```

### 3. Push to GitHub

```bash
git push -u origin phase1/task-N-description   # First push
git push                                        # Subsequent pushes
```

### 4. Open Pull Request (optional)

1. Go to GitHub repository
2. Click "Compare & pull request"
3. Title: `Phase 1 Task 3: Implement BTree order book`
4. Describe: what changed, which task, how to test
5. Create PR

### 5. After PR merges (or work is done)

```bash
git checkout main
git pull origin main
git branch -d phase1/task-N-description
```

---

## Essential Commands

```bash
# Status & info
git status              # What changed?
git log --oneline       # Commit history
git diff                # View uncommitted changes

# Branches
git branch              # List branches
git checkout -b name    # Create & switch to new branch
git checkout main       # Switch to main

# Staging & committing
git add file.go         # Stage specific file
git add .               # Stage everything
git commit -m "msg"     # Commit with message

# Syncing
git pull                # Pull latest from remote
git push                # Push commits to remote

# Undo changes
git restore file.go     # Discard uncommitted changes to file
git reset HEAD~1        # Undo last commit (keep changes)
```

---

## NEXTBULL-Specific Workflows

### Testing before commit

```bash
# Backend
cd backend && go test ./...

# Frontend
cd frontend && npm test && npm run lint

# Bots
cd bots && python -m pytest tests/
```

### Following the implementation plan

Plan: `docs/superpowers/plans/2026-03-25-phase1-backend.md`

Each task has checkboxes:
```markdown
- [ ] Step 1: Write the failing test
- [ ] Step 2: Run test to verify it fails
- [ ] Step 3: Write minimal implementation
- [ ] Step 4: Run test to verify it passes
- [ ] Step 5: Commit
```

After each step:
```bash
git add <files>
git commit -m "feat(scope): complete step N of task M"
```

### Running the full stack

```bash
docker compose up --build

# Access:
# Backend:  http://localhost:8080
# Frontend: http://localhost:3000
# WebSocket: ws://localhost:8080/ws
```

---

## Common Scenarios

**Sync with latest main:**
```bash
git checkout main
git pull origin main
git checkout your-branch
git merge main
```

**Discard all uncommitted changes:**
```bash
git restore .           # ⚠️ Cannot be undone!
```

**Undo last commit (keep changes):**
```bash
git reset HEAD~1
```

**See who changed a line:**
```bash
git blame path/to/file.go
```

---

## Quick Reference

### Daily routine
```bash
1. git checkout main && git pull origin main
2. git checkout -b phase1/task-N-description
3. # Make changes
4. git add . && git commit -m "feat(scope): description"
5. git push -u origin phase1/task-N-description
```

### Before opening PR
```bash
git checkout main && git pull origin main
git checkout your-branch && git merge main
go test ./...       # or npm test, python -m pytest
```

### After PR merges
```bash
git checkout main && git pull origin main
git branch -d your-branch
```

---

## Need Help?

- **Git docs:** https://git-scm.com/doc
- **Interactive tutorial:** https://learngitbranching.js.org/
- **Cheat sheet:** https://education.github.com/git-cheat-sheet-education.pdf
- When stuck: `git status` shows current state, Google the error message

**Remember:** The same 10 commands cover 95% of daily work. You've got this!
