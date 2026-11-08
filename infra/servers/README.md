# Servers (#12)

Two servers in Tunisia, from the cahier ("Technique et sécurité"): Docker Compose on two servers, DDoS protection. Owner: Helmi.

## 1. Choose the host

Not decided yet (D14). Before ordering, check with the host and record the answer here:

| Check | Answer |
|---|---|
| Host name and offer | `[HÉBERGEUR]` |
| Data centres in Tunisia, and the two servers in two different ones | `[À VÉRIFIER]` |
| DDoS protection included, and what it covers | `[À VÉRIFIER]` |
| Ubuntu 24.04 LTS image available | `[À VÉRIFIER]` |
| Server size (CPU, RAM, disk) | `[À FIXER]` |

## 2. Set up each server

Each engineer needs a public SSH key on their GitHub account (`https://github.com/<login>.keys`). The script reads them from there, so no password or private key is ever shared.

```bash
# as root, on a fresh Ubuntu 24.04 LTS server
curl -fsSLO https://raw.githubusercontent.com/Helmi-Megdiche/GOFAST_Repo/main/infra/servers/setup.sh
less setup.sh                                   # read it first
TEAM="Helmi-Megdiche AlaaSalem12 mootazkraiem" bash setup.sh
```

Keep the root session open, then log in from another terminal as your user (`ssh <login-in-lowercase>@<server>`). Close the root session only after that works: root login is turned off.

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
