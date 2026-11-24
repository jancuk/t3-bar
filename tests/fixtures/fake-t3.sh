#!/bin/sh
# Fake T3 CLI for tests. Echoes argv and stdin (base64) as JSON so tests can assert on them.
# Control with FAKE_T3_MODE: echo (default) | project-missing | thread-gone | exit3 | exit127 | sleep | big | nonjson
mode="${FAKE_T3_MODE:-echo}"
case "$mode" in
  project-missing) echo "No T3 Code project matches /nope"; exit 0 ;;
  thread-gone) echo "That thread is no longer available" >&2; exit 1 ;;
  exit3) echo "boom" >&2; exit 3 ;;
  exit127) exit 127 ;;
  sleep) sleep 5; exit 0 ;;
  big) yes aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | head -c 3000000; exit 0 ;;
  nonjson) echo "hello there"; exit 0 ;;
esac
stdin_b64=$(cat | base64 | tr -d '\n')
args=""
for a in "$@"; do
  enc=$(printf '%s' "$a" | base64 | tr -d '\n')
  args="$args\"$enc\","
done
args="[${args%,}]"
env_arun="${ELECTRON_RUN_AS_NODE-unset}"
printf '{"argsB64":%s,"stdinB64":"%s","env":{"ELECTRON_RUN_AS_NODE":"%s","NO_COLOR":"%s","FORCE_COLOR":"%s"}}\n' "$args" "$stdin_b64" "$env_arun" "$NO_COLOR" "$FORCE_COLOR"
