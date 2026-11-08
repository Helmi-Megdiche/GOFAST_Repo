# Servers (#12)

Two servers in Tunisia, from the cahier ("Technique et sécurité"): Docker Compose on two servers, DDoS protection. Owner: Helmi.

## 1. Choose the host

Not decided yet (D14). No Tunisian host was found with public online prices that also confirms two data centres and DDoS protection, so the choice needs quotes. Research on 8 Nov 2026:

| Host | In Tunisia | Two data centres | DDoS protection | Public price | Source |
|---|---|---|---|---|---|
| Ooredoo Business | Yes, Mghira data centre | `[À VÉRIFIER]` | Anti-DDoS platform in the data centre (2017 article), an "offre Anti-DDos" for businesses | No: quote | [African Manager](https://africanmanager.com/12_ovh-choisit-ooredoo-tunisie-pour-un-hebergement-securise-et-reglementaire/), [Kapitalis](https://kapitalis.com/tunisie/?p=24837) |
| Orange Tunisie | Yes, Tier III data centre in Kalaa Kebira, Sousse (May 2025) | `[À VÉRIFIER]` (only this site is documented) | `[À VÉRIFIER]` | No: quote | [WMC](https://www.webmanagercenter.com/2025/05/06/545641/orange-tunisie-inaugure-un-nouveau-data-center-a-sousse-pour-repondre-aux-enjeux-numeriques-de-demain/) |
| Tunisie Telecom (TT Cloud) | Yes, Carthage data centre, Tunis | `[À VÉRIFIER]` (one site listed) | `[À VÉRIFIER]` | No: quote | [Data Center Map](https://www.datacentermap.com/c/tunisie-telecom/datacenters/), [Webdo](https://www.webdo.tn/fr/actualite/tech/tunisie-telecom-lance-tt-cloud/179756/) |
| ATI (ati.tn) | Yes, Tunis | `[À VÉRIFIER]` | Not stated | Old "Cloud first" plan, 4 vCPU, 8 GB, 100 GB, 76 TND/month, listed as discontinued | [whtop](https://www.whtop.com/plans/ati.tn/157850) |

Not usable: OVHcloud's "VPS Tunisia" page sells VPS hosted abroad, not in Tunisia ([OVHcloud](https://www.ovhcloud.com/en/vps/vps-tunisia)).

Questions for each quote:

1. Can the two servers be in two different data centres in Tunisia? Which ones?
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
TEAM="Helmi-Megdiche AlaaSalem12 mootazkraiem" bash /root/setup.sh
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
- To remove someone, taking the login out of `TEAM` is not enough: run `sudo deluser --remove-home <user>` on each server.
- The back-office VPN and 2FA are #36, backups #30, monitoring #32.
