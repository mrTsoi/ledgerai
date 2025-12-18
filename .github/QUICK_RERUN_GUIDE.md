# Quick Guide: How to Rerun a GitHub Workflow

## ⚡ Fastest Method: GitHub UI

1. Go to your repository: `https://github.com/mrTsoi/ledgerai`
2. Click **"Actions"** tab
3. Find your workflow run in the list
4. Click **"Re-run jobs"** dropdown (top right)
5. Select:
   - **"Re-run all jobs"** - Runs everything again
   - **"Re-run failed jobs"** - Only failed steps

## 🎯 Manual Trigger (No Code Changes Needed)

Perfect when you want to run the workflow without pushing code:

1. Go to **Actions** tab
2. Click **"CI"** in the left sidebar
3. Click **"Run workflow"** button (right side)
4. Choose your branch (usually `main` or `develop`)
5. Click **"Run workflow"**

## 💻 Command Line Options

### Using GitHub CLI
```bash
# Install GitHub CLI first: https://cli.github.com/

# List recent runs
gh run list --workflow=ci.yml

# Rerun a specific workflow
gh run rerun <RUN_ID>

# Rerun only failed jobs
gh run rerun <RUN_ID> --failed

# Trigger workflow manually
gh workflow run ci.yml
```

### Using Git (triggers automatic run)
```bash
# Create empty commit to trigger workflow
git commit --allow-empty -m "Trigger CI workflow"
git push
```

## 🔍 Finding Your Workflow Run

Your workflow runs appear in multiple places:

- **Actions Tab**: Full list with logs
- **Pull Request**: Status checks section
- **Commits**: Green ✓ or red ✗ icons
- **Branches**: Next to branch names

## 📝 Quick Tips

- ✅ **Workflow not starting?** Check if secrets are configured in Settings → Secrets
- ✅ **Need to debug?** Click on the workflow run to see detailed logs for each step
- ✅ **Frequent failures?** Review logs and fix issues before rerunning
- ✅ **Manual trigger not visible?** Check if you're on the right branch
- ✅ **Permission denied?** Contact repository admin for access

## 🔗 Need More Details?

See [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md) for comprehensive documentation.

---

**Quick Access**: Bookmark `https://github.com/mrTsoi/ledgerai/actions` for easy workflow access!
