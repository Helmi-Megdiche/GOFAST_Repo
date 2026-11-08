#!/usr/bin/env bash
# Base setup for a GOFAST server (#12). Run once as root on a fresh Ubuntu 24.04 LTS server.
# Safe to run again. It does four things, from the issue:
#   1. Team access: one Linux account per engineer, SSH keys taken from GitHub, no passwords.
#   2. SSH by key only, no root login.
#   3. Firewall on (SSH, HTTP, HTTPS only) and automatic security updates.
#   4. Docker Engine and the Docker Compose plugin.
#
# Usage: sudo TEAM="Helmi-Megdiche AlaaSalem12 mootazkraiem" bash setup.sh
# Keep a second SSH session open until the final check passes.
set -euo pipefail

TEAM="${TEAM:-Helmi-Megdiche AlaaSalem12 mootazkraiem}"
GROUP="gofast-admins"

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
cat > /etc/ssh/sshd_config.d/10-gofast.conf <<EOF
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AllowGroups $GROUP
EOF
sshd -t || die "sshd config invalid, nothing reloaded"
systemctl reload ssh

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

log "Check"
fail=0
check() { if eval "$2" >/dev/null 2>&1; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }
check "password login off"        "sshd -T | grep -qx 'passwordauthentication no'"
check "root login off"            "sshd -T | grep -qx 'permitrootlogin no'"
check "firewall active"           "ufw status | grep -q 'Status: active'"
check "auto updates on"           "apt-config dump | grep -q 'APT::Periodic::Unattended-Upgrade \"1\"'"
check "docker running"            "docker info"
check "docker compose installed"  "docker compose version"
[ "$fail" -eq 0 ] || die "a check failed, see above"
echo "Done. Test a new SSH login as your user before closing this session."
