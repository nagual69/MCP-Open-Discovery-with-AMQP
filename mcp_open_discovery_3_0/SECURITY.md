# Security and Going-Public Checklist

This project includes discovery tooling and credentials integrations. Before publishing the repository publicly, review and follow the steps below.

## What we do already
- Encrypted credentials store with audit logging (`tools/credentials_manager.js` + `data/mcp_creds_*`).
- Example environment file (`example.env`) documents required variables; real secrets should be stored locally only.
- `.gitignore` prevents committing `.env` and `data/` runtime artifacts.

## Pre-publish checklist
1) Remove secrets from Git history
   - Stop tracking any sensitive files (keep them locally):
     - `.env`
     - `data/` (keys, audit log, SQLite db)
   - Use the commands below to remove them from Git while keeping local copies:
     - `git rm --cached .env`
     - `git rm -r --cached data`
     - `git commit -m "chore(security): stop tracking local env and data"`
   - Rewrite history to purge past leaks (optional but recommended):
     - With git-filter-repo (recommended):
       - `git filter-repo --path .env --path data --invert-paths`
     - Or with BFG Repo-Cleaner:
       - `java -jar bfg.jar --delete-files .env --delete-folders data`
     - Force-push after backup and coordination.

2) Rotate any exposed credentials
   - Rotate Zabbix/Proxmox or any tokens/passwords that may have been present.
   - Update your `.env` or credential store accordingly.

3) Sanitize examples and tests
   - Use placeholders like `<your-password>` and ensure examples rely on environment variables.

4) Add pre-commit scanning (optional but recommended)
   - Use Gitleaks or similar:
     - `gitleaks detect --redact`
   - Consider adding a pre-commit hook.

## Safe defaults
- `docker/docker-compose.yml` reads `ZABBIX_PASSWORD` from the environment; default is a placeholder.
- Tests fall back to `zabbix` when env is missing.

## Reporting a vulnerability
Please open a private security advisory or email the maintainers.
