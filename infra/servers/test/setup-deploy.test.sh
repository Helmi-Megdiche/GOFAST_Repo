#!/usr/bin/env bash
# shellcheck disable=SC2016  # the single-quoted bash -c bodies are meant to expand in the child shell
# Tests for the "deploy user" block of infra/servers/setup.sh (#14 PR 4).
# It changes users and /opt/gofast, so it must run as root in a throwaway Linux, never on a real host:
#   docker run --rm -v "$PWD/infra/servers:/s:ro" ubuntu:24.04 bash /s/test/setup-deploy.test.sh
# RV-12: it is also run against broken copies of the block (twins); each must make it fail.
# Fake keys only.
set -uo pipefail
[ "$(id -u)" -eq 0 ] && [ -f /.dockerenv ] || { echo "run this as root inside a container (see the header)"; exit 2; }

HERE=$(cd "$(dirname "$0")" && pwd)
SRC=$(cd "$HERE/.." && pwd)
SETUP="${SETUP_SH:-$SRC/setup.sh}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0; VERBOSE=1
KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI$(printf 'A%.0s' $(seq 43)) ci-fake"
LINE='command="/opt/gofast/deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding'
AK=/home/deploy/.ssh/authorized_keys

check() { local name="$1"; shift
  if "$@" >/dev/null 2>&1; then pass=$((pass+1)); [ "$VERBOSE" = 1 ] && echo "  ok   $name"
  else fail=$((fail+1)); [ "$VERBOSE" = 1 ] && echo "  FAIL $name"; fi
  return 0; }

reset() { pkill -u deploy 2>/dev/null; userdel -r deploy >/dev/null 2>&1; rm -rf /opt/gofast /home/deploy; getent group docker >/dev/null || groupadd docker; }
extract() { sed -n '/^# --- deploy user begin/,/^# --- deploy user end/p' "$1" > "$2"; [ -s "$2" ]; }
run_block() { # block file, key; sets RC and OUT
  cat > "$TMP/harness.sh" <<EOF
log() { printf '\n== %s\n' "\$*"; }
die() { printf 'ERROR: %s\n' "\$*" >&2; exit 1; }
set -euo pipefail
. "$1"
EOF
  OUT=$(DEPLOY_PUBKEY="$2" SRC_DIR="$SRC" bash "$TMP/harness.sh" 2>&1); RC=$?
}
tree_state() { { find /opt/gofast /home/deploy -printf '%p %m %u:%g\n' | sort; cat "$AK" 2>/dev/null; id deploy; } | sha256sum; }
mode() { stat -c '%a %U:%G' "$1"; }

suite() { # block file
  local b="$1" k i
  reset; run_block "$b" "$KEY"
  check "valid key: exit 0" test "$RC" = 0
  check "authorized_keys is exactly the forced-command line plus the key" test "$(cat $AK)" = "$LINE $KEY"
  check "authorized_keys is root-owned 644 in a root-owned 755 .ssh" bash -c '[ "$(stat -c "%a %U:%G" '$AK')" = "644 root:root" ] && [ "$(stat -c "%a %U:%G" /home/deploy/.ssh)" = "755 root:root" ]'
  check "password locked" bash -c 'passwd -S deploy | awk "{print \$2}" | grep -qx L'
  check "shell is bash (sshd runs the forced command through it)" bash -c '[ "$(getent passwd deploy | cut -d: -f7)" = /bin/bash ]'
  check "member of docker" bash -c 'id -nG deploy | tr " " "\n" | grep -qx docker'
  check "/opt/gofast root:root 755" test "$(mode /opt/gofast)" = "755 root:root"
  check "secrets root:deploy 750" test "$(mode /opt/gofast/secrets)" = "750 root:deploy"
  check "state and repo owned by deploy" bash -c '[ "$(stat -c %U /opt/gofast/state)" = deploy ] && [ "$(stat -c %U /opt/gofast/repo)" = deploy ]'
  check "deploy.sh root:root 755 and identical to the source" bash -c '[ "$(stat -c "%a %U:%G" /opt/gofast/deploy.sh)" = "755 root:root" ] && cmp -s /opt/gofast/deploy.sh '"$SRC"'/deploy.sh'
  check "deploy.env is a root:deploy 640 template" bash -c '[ "$(stat -c "%a %U:%G" /opt/gofast/deploy.env)" = "640 root:deploy" ]'
  before=$(tree_state); run_block "$b" "$KEY"
  check "second run: exit 0 and nothing changed" test "$RC" = 0 -a "$before" = "$(tree_state)"
  echo "ssh-ed25519 KEEP-MY-ENV=1" > /opt/gofast/deploy.env; run_block "$b" "$KEY"
  check "second run does not overwrite an existing deploy.env" test "$(cat /opt/gofast/deploy.env)" = "ssh-ed25519 KEEP-MY-ENV=1"

  # Keys that must be refused, each one leaves the machine as it was.
  i=0
  for k in "" "command=\"x\" $KEY" "$KEY"$'\n'"$KEY" "ssh-rsa AAAAB3NzaC1yc2E$(printf 'A%.0s' $(seq 60)) x" "${KEY% *} a b" \
           "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI$(printf 'A%.0s' $(seq 43)),environment=\"X=1\"" "no-pty $KEY" "${KEY%AA} " "${KEY}\" ,permitopen=\"x"; do
    i=$((i+1)); reset; run_block "$b" "$k"
    check "bad key #$i refused: exit non-zero, no authorized_keys" bash -c '[ "$1" != 0 ] && [ ! -e "$2" ]' _ "$RC" "$AK"
  done

  # No key at all: the user exists, can log in nowhere.
  reset; run_block "$b" ""
  check "no key: refused with a clear message" bash -c '[[ "$1" == *DEPLOY_PUBKEY* ]]' _ "$OUT"
}

mutate() { # marker, replacement, in, out
  local line n=0; : > "$4"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" == *"# MUT-$1"* ]]; then printf '%s\n' "$2" >> "$4"; n=$((n+1)); else printf '%s\n' "$line" >> "$4"; fi
  done < "$3"; [ "$n" -ge 1 ]
}

extract "$SETUP" "$TMP/real.sh" || { echo "FAIL: no deploy user block (markers) in setup.sh"; exit 1; }
echo "== deploy user block"
suite "$TMP/real.sh"; real_fail=$fail; echo "   $pass ok, $fail failed"

twin_fail=0
echo "== twins"
for t in 'keycheck|:' 'forced|printf "%s\n" "$DEPLOY_PUBKEY" > "$DEPLOY_AK"' 'locked|passwd -d deploy >/dev/null' 'ownership|install -d -m 755 -o deploy -g deploy /home/deploy/.ssh'; do
  name=${t%%|*}; repl=${t#*|}
  if ! mutate "$name" "$repl" "$TMP/real.sh" "$TMP/mut.sh"; then echo "  FAIL twin $name: no marker"; twin_fail=$((twin_fail+1)); continue; fi
  pass=0; fail=0; VERBOSE=0; suite "$TMP/mut.sh"; VERBOSE=1
  if [ "$fail" -gt 0 ]; then echo "  ok   twin $name fails the suite as it must ($fail checks failed)"
  else echo "  FAIL twin $name: the suite still passes"; twin_fail=$((twin_fail+1)); fi
done
echo "== result: suite failures $real_fail, twins that did not fail $twin_fail"
[ "$real_fail" -eq 0 ] && [ "$twin_fail" -eq 0 ]
