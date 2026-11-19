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
- The back-office VPN and 2FA are #36, backups #30, monitoring #32.

## Database setup (once per database, before the first migration)

The migrations create no role and no password. On a new database, the PostgreSQL superuser runs `db-setup.sql` from a terminal (roles, PostGIS, and the `fastgo_public_reader` grant that migration 0005 needs):

```
psql "postgres://postgres@127.0.0.1:5432/fastgo" -f infra/servers/db-setup.sql
```

The script asks for 5 passwords (migrator, app, readonly, worker, `pgbouncer_auth`) with psql `\password`: hidden prompt, typed twice, hashed on the client with SCRAM-SHA-256, so the plain password never reaches the server, its log or the process list. It stops with an error when it is not run in a terminal or when `password_encryption` is not `scram-sha-256`. It can be run again (it asks again). It mirrors `apps/api/src/int/harness.ts`; change both together. Then run the migrations as `fastgo_migrator`, direct to PostgreSQL, never through PgBouncer.

`pgbouncer_auth` is the login PgBouncer uses to look up the app logins (`auth_query` on `pgbouncer.get_auth`, created by the script). It sees the hash of `fastgo_app`, `fastgo_readonly` and `fastgo_worker` only. No password or hash is written in a PgBouncer file.

On a laptop or in CI there is no terminal: pass the 5 passwords as psql variables (`-v pw_migrator=x ... -v pw_pgbouncer=x`, fake values only). `infra/compose` does this for you. A real host never uses this mode.

## Secrets and backups on the host

Checklist for each host. Open choices are marked `[À FIXER]`.

- [ ] Database passwords are generated on the host (for example `openssl rand -base64 32`), one per role, never reused, never sent by chat or e-mail.
- [ ] The app reads them from files owned by root with mode 600 (or Docker secrets), not from a `.env` readable by every engineer account.
- [ ] `log_statement` is not `all` or `ddl` while passwords are set.
- [ ] Backups are encrypted before they leave the server, the key is kept off the server, and a restore is tested (#30).
- [ ] Who may read the secrets: `[À FIXER]` with Helmi.

## Removing a person: `offboard.sh`

```
sudo DRY_RUN=1 bash offboard.sh <github-login>   # list what would be done
sudo bash offboard.sh <github-login>             # do it, then list what remains for that name
```

Run it as root on every server. It ends the person's sessions, deletes the account with its home directory (so `authorized_keys` goes too), removes a sudoers file naming them (the shared `gofast-admins` group file stays), and lists what remains: group memberships, mail, crontab, files owned by the old uid, mentions under `/etc/ssh`, `/etc/sudoers.d` and `/opt/gofast`. Files it finds elsewhere are listed, never deleted. It can be run again: a second run says there is no account. It refuses `root`, your own login and anything that is not a plain login. Rotate any secret the person could read; the script cannot do that.
