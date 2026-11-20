# Servers (#12)

Two servers, from the cahier ("Technique et sécurité"): Docker Compose on two servers, DDoS protection. Hosted abroad (France or similar), agreed with GOFAST on 17 Nov 2026 (the cahier said Tunisia). Owner: Helmi.

The transfer of personal data abroad needs an INPDP authorisation, which GOFAST is asking for (Helmi).

## 1. Choose the host

Not decided yet (D14). The host is now abroad (France or similar), so the table below, a Tunisian-host survey made on 8 Nov 2026 before the change, is background only. Candidates abroad need quotes or public prices that confirm two data centres and DDoS protection.

| Host | In Tunisia (8 Nov survey) | Two data centres | DDoS protection | Public price | Source |
|---|---|---|---|---|---|
| Ooredoo Business | Yes, Mghira data centre | `[À VÉRIFIER]` | Anti-DDoS platform in the data centre (2017 article), an "offre Anti-DDos" for businesses | No: quote | [African Manager](https://africanmanager.com/12_ovh-choisit-ooredoo-tunisie-pour-un-hebergement-securise-et-reglementaire/), [Kapitalis](https://kapitalis.com/tunisie/?p=24837) |
| Orange Tunisie | Yes, Tier III data centre in Kalaa Kebira, Sousse (May 2025) | `[À VÉRIFIER]` (only this site is documented) | `[À VÉRIFIER]` | No: quote | [WMC](https://www.webmanagercenter.com/2025/05/06/545641/orange-tunisie-inaugure-un-nouveau-data-center-a-sousse-pour-repondre-aux-enjeux-numeriques-de-demain/) |
| Tunisie Telecom (TT Cloud) | Yes, Carthage data centre, Tunis | `[À VÉRIFIER]` (one site listed) | `[À VÉRIFIER]` | No: quote | [Data Center Map](https://www.datacentermap.com/c/tunisie-telecom/datacenters/), [Webdo](https://www.webdo.tn/fr/actualite/tech/tunisie-telecom-lance-tt-cloud/179756/) |
| ATI (ati.tn) | Yes, Tunis | `[À VÉRIFIER]` | Not stated | Old "Cloud first" plan, 4 vCPU, 8 GB, 100 GB, 76 TND/month, listed as discontinued | [whtop](https://www.whtop.com/plans/ati.tn/157850) |

Note (8 Nov): OVHcloud's "VPS Tunisia" page sells VPS hosted abroad, not in Tunisia ([OVHcloud](https://www.ovhcloud.com/en/vps/vps-tunisia)). Abroad hosting is now allowed, so OVHcloud and similar hosts in France are candidates.

Questions for each quote:

1. Can the two servers be in two different data centres (France or similar)? Which ones?
2. Is DDoS protection included, at what level (network, application), and up to what volume?
3. Ubuntu 24.04 LTS image, root SSH access, a fixed public IPv4 per server?
4. Monthly price for the size below, contract length, setup fee, invoice to a company.

Size to ask for (proposal, `[À FIXER]` with GOFAST): per server 4 vCPU, 8 GB RAM, 160 GB SSD, Ubuntu 24.04 LTS, 1 public IPv4. Reason: each server runs the Compose stack of CLAUDE.md (api, ws, worker, web, back-office, PostgreSQL + PostGIS, Redis); the cahier gives no size.

Record the decision here:

| Check | Answer |
|---|---|
| Host and offer | `[HÉBERGEUR]` |
| Data centres of server 1 and server 2 | `[À VÉRIFIER]` |
| DDoS protection | `[À VÉRIFIER]` |
| Size and monthly price | `[À FIXER]` |

## 2. SSH keys (each engineer, once)

The script reads public keys from GitHub, so no password or private key is ever shared.

```powershell
# Windows PowerShell (macOS and Linux: same command in a terminal)
ssh-keygen -t ed25519 -C "<your-github-login>"
Get-Content $HOME\.ssh\id_ed25519.pub    # copy this line (the .pub file only)
```

Then add it at https://github.com/settings/keys ("New SSH key", type "Authentication key"). Check it shows at `https://github.com/<login>.keys`. Never send the file without `.pub`.

## 3. Set up each server

The repo is private, so copy the script from a clone, from your PC:

```bash
scp infra/servers/setup.sh root@<server-ip>:/root/
ssh root@<server-ip>
less /root/setup.sh                             # read it first
TEAM="Helmi-Megdiche AlaaSalem12" bash /root/setup.sh
```

Keep the root session open, then log in from another terminal as your user (`ssh <login-in-lowercase>@<server-ip>`, for example `ssh helmi-megdiche@...`). Close the root session only after that works: root login and the image's default user (`ubuntu`) are turned off.

What the script does:

- one account per engineer, in the group `gofast-admins`, password locked, `sudo` without a password;
- SSH by key only, no root login, only `gofast-admins` may log in;
- `ufw`: incoming traffic denied except SSH, 80 and 443;
- `unattended-upgrades` on (security updates every day);
- Docker Engine and the Docker Compose plugin from Docker's apt repository; the team is in the `docker` group.

It ends with a check list and stops with an error if one item fails. It can be run again, for example to refresh keys after someone adds one on GitHub.

## Rules for later issues

- Docker publishes ports past `ufw`. Bind container ports to `127.0.0.1`; only the reverse proxy listens on 80 and 443.
- To remove someone, taking the login out of `TEAM` does **not** remove the account: run `sudo bash offboard.sh <github-login>` on each server (see below).
- On staging the data ports (PostgreSQL 15432, PgBouncer 16432, Redis 16379, S3 18333) stay on 127.0.0.1. Admin access goes through an SSH tunnel only (`ssh -L 15432:127.0.0.1:15432 <login>@<server>`); never bind them to 0.0.0.0. The api, ws and web publish no host port at all on staging (Caddy is the only way in).
- The back-office VPN and 2FA are #36, backups #30, monitoring #32.

## Database setup (once per database, before the first migration)

The migrations create no role and no password. On a new database, the PostgreSQL superuser runs `db-setup.sql` from a terminal (roles, PostGIS, the `fastgo_public_reader` grant that migration 0005 needs, and the `fastgo_staff_auth` role that migration 0013 needs):

```
psql "postgres://postgres@127.0.0.1:5432/fastgo" -f infra/servers/db-setup.sql
```

The script asks for 5 passwords (migrator, app, readonly, worker, `pgbouncer_auth`) with psql `\password`: hidden prompt, typed twice, hashed on the client with SCRAM-SHA-256, so the plain password never reaches the server, its log or the process list. It stops with an error when it is not run in a terminal or when `password_encryption` is not `scram-sha-256`. It can be run again (it asks again). It mirrors `apps/api/src/int/harness.ts`; change both together. Before the migration step, the script has created, in the same style as `fastgo_public_reader` and `fastgo_order_writer`:

```
create role fastgo_staff_auth nologin;
grant fastgo_staff_auth to fastgo_migrator with inherit false, set true;
```

The grant is SET-only: `fastgo_migrator` can `SET ROLE fastgo_staff_auth` but does not inherit its rights. Migration 0013 (GH-25) hands the `staff_totp_*` definers to that role and stops if the grant is missing. Staging does not run db-setup (the `setup` profile is off, see `infra/compose/README.md`), so on an existing staging database these two statements are run once by hand, as the superuser, before the deploy that carries 0013. Then run the migrations as `fastgo_migrator`, direct to PostgreSQL, never through PgBouncer.

`pgbouncer_auth` is the login PgBouncer uses to look up the app logins (`auth_query` on `pgbouncer.get_auth`, created by the script). It sees the hash of `fastgo_app`, `fastgo_readonly` and `fastgo_worker` only. No password or hash is written in a PgBouncer file.

On a laptop or in CI there is no terminal: pass the 5 passwords as psql variables (`-v pw_migrator=x ... -v pw_pgbouncer=x`, fake values only). `infra/compose` does this for you. A real host never uses this mode.

## Back-office second factor: enrol and reset (GH-25)

`TOTP_KEY` (32 bytes, base64) encrypts the TOTP secrets of the back-office accounts. It is required in production and is set in the server env file next to `AUTH_SECRET`; generate it on the host (`openssl rand -base64 32`), never reuse the fake value of the example files, never send it by chat or e-mail.

The enrol and reset commands have no screen. An engineer from the ops team runs them on the staging host, in the repo checkout, with the operator login and the same `TOTP_KEY` as the running api:

```
DATABASE_MIGRATOR_URL=postgres://fastgo_migrator:<password>@127.0.0.1:15432/fastgo TOTP_KEY=<the server value> pnpm --filter @fastgo/api staff:totp enrol <account-id> [--label <text>]

pnpm --filter @fastgo/api staff:totp reset <account-id> --by <admin-id> --reason "<text>"
```

- `<account-id>`, `<admin-id>` are uuids. `enrol` prints one `otpauth://` address, once; it is not stored. The engineer gives it to the person in person or over a channel the person controls (not in a ticket, a chat history or a log), and the person types or scans it into an authenticator app. `reset` clears the enrolment (lost phone); the account then enrols again with `enrol`. It needs `--by` (another admin than the account) and a `--reason`; both are audited.
- When `TOTP_KEY` changes, the stored secrets cannot be decrypted. Every enrolled account must be reset (`reset`) and enrolled again (`enrol`) with the new key. Plan this before rotating the key.
- The migrator login can `SET ROLE fastgo_staff_auth`, so the "second admin" check on `reset` is a trace, not a control against the operator: whoever holds that login can reach the definers' data without a second person. Only the audit row and the access to the login protect it.

## Secrets and backups on the host

Checklist for each host. Open choices are marked `[À FIXER]`.

- [ ] Database passwords are generated on the host (for example `openssl rand -base64 32`), one per role, never reused, never sent by chat or e-mail.
- [ ] The app reads them from files owned by root with mode 600 (or Docker secrets), not from a `.env` readable by every engineer account.
- [ ] `log_statement` is not `all` or `ddl` while passwords are set.
- [ ] Backups are encrypted before they leave the server, the key is kept off the server, and a restore is tested (#30).
- [ ] Who may read the secrets: `[À FIXER]` with Helmi.

## CI deploy to staging (#14 PR 4)

`.github/workflows/deploy.yml` builds the api and web images once per commit on `main` (after CI is green), pushes them to GHCR tagged with the full commit SHA, reads the two digests the registry now holds, then asks the staging host to deploy that commit over SSH. No host, address, key or token is in the repo: they are secrets of the GitHub environment `staging`.

**The `deploy` user.** `setup.sh` creates it with a locked password and one `authorized_keys` line that starts `restrict,command="/opt/gofast/deploy.sh"`. `restrict` turns off at once every forwarding, pty, `~/.ssh/rc` and any option added to sshd later. Whatever the client asks for, sshd runs only `deploy.sh`, which reads `SSH_ORIGINAL_COMMAND` and accepts exactly `deploy <40-hex sha> <api sha256:64hex> <web sha256:64hex>` or `rollback`; anything else is refused before any action.

**Why `deploy` is in the `docker` group.** It has to pull images and run `docker compose`, and the docker group is root-equivalent on the host (a member can mount `/` in a container). That is accepted on purpose: the forced command is the only limit. Nobody can get a shell, a port forward or another command with that key, and `deploy`'s home, `.ssh` and `authorized_keys` belong to root, so `deploy` cannot replace the line. If the key leaks, the attacker can deploy or roll back a commit of `main` and nothing else; rotate it (below).

**What `deploy.sh` does.** It takes a lock (one deploy at a time), checks the SHA is an ancestor of `origin/main` in `/opt/gofast/repo` (the compose files come from that checkout), refuses a commit that is older than the one running, logs in to GHCR with the read-only pull token (stdin, throwaway docker config), pulls both images **by digest** (`image@sha256:...`, never a tag: a tag can be moved, a digest cannot, so what CI built is exactly what runs), checks that both pulled images carry the `org.opencontainers.image.revision` label equal to the commit (else refused before `compose up`, nothing changed; this stops a valid commit being paired with another real image, it is not proof against a forged build: signing is a follow-up), runs compose with the staging override (`migrate` first, `up -d --wait`), then checks `/v1/health` and `/fr` through Caddy. It keeps the `current` and `previous` releases in `/opt/gofast/state`, one line each: the SHA and the two digests, so a rollback also runs by digest. If a health check fails it redeploys `previous` and exits non-zero (1: refused, or failed and rolled back; 2: the rollback itself failed). `rollback` with no `previous` is refused. A first deploy that fails has nothing to roll back to.

**An older commit never replaces a newer one.** CI runs finish in any order, so the deploy for commit A can arrive after the one for its successor B. `deploy.sh` refuses it (`older than current, use rollback`) unless the running commit is an ancestor of the requested one; the same commit again is fine. That run is **red on purpose**: nothing was changed, and a red run for an old commit after a newer one is deployed is expected. To go back deliberately, use `rollback`.

**Rollback is code only.** Migrations go forward only. A release that changes the schema must be backward compatible: expand (add the column or table, keep the old code working) in one release, contract (drop the old one) in a later release. Never ship a migration that the previous version cannot run against.

**Set up the host once** (after `setup.sh` and the database setup above):

1. Run `setup.sh` with the CI public key: `sudo TEAM="..." DEPLOY_PUBKEY="ssh-ed25519 AAAA... ci" bash setup.sh`. The script refuses anything that is not one plain `ssh-ed25519` line. Generate the pair on your PC (`ssh-keygen -t ed25519 -C ci -N ""`), give the server the `.pub` only, put the private file in the `STAGING_SSH_KEY` secret, then delete it from your PC.
2. Fill `/opt/gofast/deploy.env` (root:deploy 640): `GHCR_OWNER` (lowercase owner), `GHCR_USER` (login the pull token belongs to), `REPO_URL` (https URL of the repo). Read as data, never sourced.
3. Create `/opt/gofast/secrets/staging.env` (the compose env file for staging, see `infra/compose/README.md`) and `/opt/gofast/secrets/staging-basic-password` (the staging basic-auth password in clear, one line: the health check logs in with it; the file is root:deploy 640, in a 750 directory). Fake data only on staging.
4. Put the GHCR pull token in `/opt/gofast/secrets/ghcr-token` (root:deploy 640): a classic personal access token with `read:packages` only, from an account that can read the images.
   **Make both packages private.** The first push creates `gofast-api` and `gofast-web` on GHCR; a package created by a workflow can start public or inherit the repository's visibility. After that first push, on GitHub: your profile (or the organisation) → Packages → each package → Package settings → Danger Zone → Change visibility → **Private**. Under "Manage Actions access" keep this repository with Write, so the workflow can still push. Only then does the read-only pull token mean something: with a public package, anyone can pull the image without it.
5. Add to the GitHub environment `staging` the secrets `STAGING_HOST`, `STAGING_SSH_KEY`, `STAGING_KNOWN_HOSTS` (the server's host key line, from `ssh-keyscan -t ed25519 <host>` checked against the console, never trusted on first use), and to the repository the variables `SITE_URL` and `API_DOMAINS` (inlined into the web image at build time). Until the three secrets exist the deploy job is green and says in its summary that it deployed nothing.
6. Check the Caddy login box in a browser once, then run `deploy.sh` by hand over SSH with a known SHA.

**Rotate the deploy key.** Generate a new pair, run `setup.sh` again with the new `DEPLOY_PUBKEY` (it rewrites the one line), replace `STAGING_SSH_KEY`, run the workflow, delete the old private key everywhere.

**Rotate the GHCR pull token.** Create the new token, write it over `/opt/gofast/secrets/ghcr-token`, run a deploy to prove it works, then revoke the old one on GitHub.

**Tests.** `infra/servers/test/deploy.test.sh` (fake docker, curl and git, plus broken copies of `deploy.sh` that must fail it) and `setup-deploy.test.sh` (needs root in a throwaway container, with apt and network; it never touches a real host) run in CI as the job "Shell scripts and workflows". The second one also starts a real `sshd` in the container and logs in over loopback with a throwaway key: `deploy <bad>` gets `deploy.sh`'s refusal, `bash` and `-N -L` are refused, and a locked password plus a key still logs in (`UsePAM yes`). In the container only, `pam_loginuid` is set to optional, because a container cannot write `/proc/self/loginuid`. On Windows run them in a container: `docker run --rm -v "$PWD/infra/servers:/s:ro" ubuntu:24.04 bash /s/test/deploy.test.sh`.

## Removing a person: `offboard.sh`

```
sudo DRY_RUN=1 bash offboard.sh <github-login>   # list what would be done
sudo bash offboard.sh <github-login>             # do it, then list what remains for that name
```

Run it as root on every server. It ends the person's sessions, deletes the account with its home directory (so `authorized_keys` goes too), removes a sudoers file naming them (the shared `gofast-admins` group file stays), and lists what remains: group memberships, mail, crontab, files owned by the old uid, mentions under `/etc/ssh`, `/etc/sudoers.d` and `/opt/gofast`. Files it finds elsewhere are listed, never deleted. It can be run again: a second run says there is no account. It refuses `root`, your own login and anything that is not a plain login. A sudoers file is deleted only when every non-comment line names that person; a file that also names someone else is left alone and flagged (`!! <file> names <user> with others: edit with visudo`, counted as left). The leftover search skips `/var/lib/docker` and `/var/lib/containerd` (container volumes use their own uids) and says so. Rotate any secret the person could read; the script cannot do that.

**A removed uid can be given to the next new account.** So any file the script lists as owned by the old uid must be deleted or re-owned before you add someone, or the new person inherits it.
