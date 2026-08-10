#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd "/Users/moritzrichter/Documents/Personal Page"
if [ -n "$PORT" ]; then
  exec npm run dev -- --port "$PORT"
else
  exec npm run dev
fi
