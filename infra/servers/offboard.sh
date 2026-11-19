#!/usr/bin/env bash
# Remove one person from a GOFAST server (#14). Run as root on each server.
# Safe to run again: a second run finds nothing to remove and says so.
#
# Usage: sudo bash offboard.sh <github-login>      (the TEAM name; the Linux user is its lowercase form)
#        sudo DRY_RUN=1 bash offboard.sh <login>   (only list what would be done)
#
# It does, in this order: end the person's sessions and processes, delete the account with its home
# directory (that removes ~/.ssh/authorized_keys), delete a sudoers file or line naming them, then list
# what remains on the server for that name. Files owned elsewhere are listed, never deleted.
# Taking a name out of TEAM in setup.sh does NOT remove the account: run this script.
set -euo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
[ $# -eq 1 ] || die "usage: offboard.sh <github-login>"
login="$1"
# The name goes into paths and grep patterns: letters, digits, dash, underscore only. No root, no empty.
[[ "$login" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] || die "invalid login: $login"
user="$(printf '%s' "$login" | tr '[:upper:]' '[:lower:]')"
case "$user" in root|ubuntu|daemon|bin|sys|nobody) die "refusing to remove system account $user" ;; esac
[ "$(logname 2>/dev/null || true)" != "$user" ] || die "refusing to remove the account you are logged in as"

run() { if [ -n "${DRY_RUN:-}" ]; then say "would: $*"; else "$@"; fi; }
changed=0
uid=""

if id "$user" >/dev/null 2>&1; then
  uid=$(id -u "$user")
  say "== account $user"
  run pkill -KILL -u "$user" 2>/dev/null || true       # sessions and processes: userdel refuses while they run
  run loginctl terminate-user "$user" 2>/dev/null || true
  run userdel --remove "$user"                          # home directory, authorized_keys, mail spool, group
  changed=1
else
  say "no account $user (already removed)"
fi

# sudo rights: setup.sh gives sudo through the gofast-admins group (gone with the account); remove any
# file or line that names the user directly.
for f in /etc/sudoers.d/*; do
  [ -f "$f" ] || continue
  if grep -qE "^[[:space:]]*$user[[:space:]]" "$f"; then
    say "== sudoers file $f names $user"
    run rm -f "$f"
    changed=1
  fi
done
if grep -qE "^[[:space:]]*$user[[:space:]]" /etc/sudoers 2>/dev/null; then
  say "!! /etc/sudoers names $user: edit it with visudo, not done automatically"
fi

# What remains for that name. Each line is something a person still has to look at.
say "== remaining for $user (nothing below means clean)"
left=0
if getent passwd "$user" >/dev/null; then say "account still exists"; left=1; fi
if getent group "$user" >/dev/null; then say "group still exists: $user"; left=1; fi
if getent group | awk -F: -v u="$user" '{n=split($4,m,","); for(i=1;i<=n;i++) if(m[i]==u) print "member of group " $1}' | grep .; then left=1; fi
[ ! -e "/home/$user" ] || { say "home directory still exists: /home/$user"; left=1; }
[ ! -e "/var/mail/$user" ] || { say "mail spool: /var/mail/$user"; left=1; }
[ ! -e "/var/spool/cron/crontabs/$user" ] || { say "crontab: /var/spool/cron/crontabs/$user"; left=1; }
if grep -rIl -- "$user" /etc/ssh /etc/sudoers.d /root/.ssh /opt/gofast 2>/dev/null | grep .; then left=1; fi
if grep -rIs -- "$login" /root/.ssh/authorized_keys /opt/gofast 2>/dev/null | grep -i "ssh-" ; then left=1; fi
# The name no longer resolves once the account is gone, so look by uid (kept before the delete). On a
# second run there is no uid: list files owned by no existing user instead.
if [ -n "$uid" ]; then match=(-uid "$uid"); else match=(-nouser); fi
owned=$(find / -xdev \( -path /proc -o -path /sys \) -prune -o "${match[@]}" -print 2>/dev/null | head -20 || true)
[ -z "$owned" ] || { say "files still owned by the removed uid, or by no user (first 20):"; say "$owned"; left=1; }
say "-- also by hand: GitHub org membership, repository secrets the person knew, passwords and keys they could read (rotate them)."

[ "$left" = 0 ] && say "clean: nothing left for $user" || say "items above need a look"
[ "$changed" = 0 ] && say "nothing was changed in this run"
exit 0
