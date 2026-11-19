#!/usr/bin/env bash
# Base setup for a GOFAST server (#12). Run once as root on a fresh Ubuntu 24.04 LTS server.
# Safe to run again. It does four things, from the issue:
#   1. Team access: one Linux account per engineer, SSH keys taken from GitHub, no passwords.
#   2. SSH by key only, no root login.
#   3. Firewall on (SSH, HTTP, HTTPS only) and automatic security updates.
#   4. Docker Engine and the Docker Compose plugin.
#
#   5. The `deploy` user for CI (#14 PR 4): one forced command, see deploy.sh and README.
#
# Usage: sudo TEAM="Helmi-Megdiche AlaaSalem12" DEPLOY_PUBKEY="ssh-ed25519 AAAA... ci" bash setup.sh
# Keep a second SSH session open until the final check passes.
set -euo pipefail

TEAM="${TEAM:-Helmi-Megdiche AlaaSalem12}"
GROUP="gofast-admins"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n== %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
# shellcheck source=/dev/null
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "written for Ubuntu 24.04 LTS, found ${ID:-unknown}"

export DEBIAN_FRONTEND=noninteractive

log "Packages"
apt-get update -q
apt-get install -y -q ca-certificates curl ufw unattended-upgrades

log "Team accounts (keys from github.com/<login>.keys)"
getent group "$GROUP" >/dev/null || groupadd "$GROUP"
# Members of the admin group use sudo without a password: no password exists to share.
echo "%$GROUP ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-gofast-admins
chmod 440 /etc/sudoers.d/90-gofast-admins
visudo -cf /etc/sudoers.d/90-gofast-admins >/dev/null

for login in $TEAM; do
  user=$(printf '%s' "$login" | tr '[:upper:]' '[:lower:]')
  keys=$(curl -fsSL "https://github.com/${login}.keys") || die "cannot fetch keys for $login"
  [ -n "$keys" ] || die "$login has no public SSH key on GitHub: add one, then run again"
  id "$user" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$user"
  passwd -l "$user" >/dev/null
  usermod -aG "$GROUP" "$user"
  install -d -m 700 -o "$user" -g "$user" "/home/$user/.ssh"
  printf '%s\n' "$keys" > "/home/$user/.ssh/authorized_keys"
  chown "$user:$user" "/home/$user/.ssh/authorized_keys"
  chmod 600 "/home/$user/.ssh/authorized_keys"
  echo "  $user: $(printf '%s\n' "$keys" | wc -l) key(s)"
done

log "SSH: keys only, no root login"
# sshd keeps the first value it reads, and 10- sorts before the cloud image's 50-cloud-init.conf.
cat > /etc/ssh/sshd_config.d/10-gofast.conf <<EOF
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AllowGroups $GROUP deploy
EOF
sshd -t || die "sshd config invalid, nothing reloaded"
# Ubuntu 24.04 starts sshd from ssh.socket, so ssh.service may be inactive: reload only if running.
systemctl try-reload-or-restart ssh

log "Firewall: deny incoming except SSH, HTTP, HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

log "Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades

log "Docker Engine and Compose plugin (Docker's apt repository)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
for login in $TEAM; do usermod -aG docker "$(printf '%s' "$login" | tr '[:upper:]' '[:lower:]')"; done
# Docker writes its own iptables rules and bypasses ufw for published ports.
# Publish container ports on 127.0.0.1 only; the reverse proxy is the one public entry (80/443).

# --- deploy user begin (#14 PR 4)
log "Deploy user: it can run one forced command (deploy.sh), nothing else over SSH"
# Input first, before any change: one ssh-ed25519 line, no options (a key line carrying its own options could
# override the forced command), comment limited to plain characters.
DEPLOY_AK=/home/deploy/.ssh/authorized_keys
FORCED='command="/opt/gofast/deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding'
key_re='^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA[A-Za-z0-9+/]{44}( [A-Za-z0-9@._-]+)?$'
[ -n "${DEPLOY_PUBKEY:-}" ] || die "DEPLOY_PUBKEY is required: the CI public key, one ssh-ed25519 line"
[[ "$DEPLOY_PUBKEY" =~ $key_re ]] || die "DEPLOY_PUBKEY must be exactly one plain ssh-ed25519 key line, with no options" # MUT-keycheck

# Shell is bash on purpose: sshd runs the forced command through the login shell, and nologin would refuse it.
id deploy >/dev/null 2>&1 || useradd --no-create-home --home-dir /home/deploy --shell /bin/bash deploy
passwd -l deploy >/dev/null # MUT-locked
# docker group = root-equivalent on this host. Accepted: the only way in is the forced command below.
usermod -aG docker deploy

install -d -m 755 -o root -g root /opt/gofast
install -d -m 750 -o root -g deploy /opt/gofast/secrets
install -d -m 750 -o deploy -g deploy /opt/gofast/state /opt/gofast/repo
# Home and .ssh belong to root: deploy cannot swap its own authorized_keys for one without the forced command.
install -d -m 755 -o root -g root /home/deploy
install -d -m 755 -o root -g root /home/deploy/.ssh # MUT-ownership
install -m 755 -o root -g root "${SRC_DIR:?}/deploy.sh" /opt/gofast/deploy.sh
printf '%s %s\n' "$FORCED" "$DEPLOY_PUBKEY" > "$DEPLOY_AK" # MUT-forced
chown root:root "$DEPLOY_AK"
chmod 644 "$DEPLOY_AK"
# Template only when absent: a person fills it in, a second run never overwrites it.
if [ ! -e /opt/gofast/deploy.env ]; then
  printf '%s\n' '# Read as data by deploy.sh, never sourced. Fill in on the server; do not commit real values.' \
    'GHCR_OWNER=' 'GHCR_USER=' 'REPO_URL=' > /opt/gofast/deploy.env
fi
chown root:deploy /opt/gofast/deploy.env
chmod 640 /opt/gofast/deploy.env
# --- deploy user end

log "Check"
fail=0
check() { if eval "$2" >/dev/null 2>&1; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }
check "password login off"        "sshd -T | grep -qx 'passwordauthentication no'"
check "root login off"            "sshd -T | grep -qx 'permitrootlogin no'"
check "firewall active"           "ufw status | grep -q 'Status: active'"
check "auto updates on"           "apt-config dump | grep -q 'APT::Periodic::Unattended-Upgrade \"1\"'"
check "docker running"            "docker info"
check "docker compose installed"  "docker compose version"
check "deploy user password locked" "passwd -S deploy | awk '{print \$2}' | grep -qx L"
check "deploy key is forced"      "grep -q '^command=\"/opt/gofast/deploy.sh\",no-pty' $DEPLOY_AK"
check "deploy.sh is root-owned"   "[ \"\$(stat -c %U:%a /opt/gofast/deploy.sh)\" = root:755 ]"
[ "$fail" -eq 0 ] || die "a check failed, see above"
echo "Done. Test a new SSH login as your user before closing this session."
