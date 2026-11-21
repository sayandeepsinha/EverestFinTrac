#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist/server dist/.openai
node -e 'const fs=require("fs"); const crypto=require("crypto");const importer=fs.readFileSync("lib/cas-candidates.mjs","utf8").replace("export function prepareCasCandidates", "function prepareCasCandidates");const backup=fs.readFileSync("lib/backup-crypto.mjs","utf8").replaceAll("export async function", "async function");const page=fs.readFileSync("public/index.html","utf8").replace("/* CAS_IMPORT_ADAPTER */",importer).replace("/* BACKUP_CRYPTO */",backup);const match=page.match(/<script>([\s\S]*?)<\/script>/);if(!match)throw Error("Application script missing");const hash=crypto.createHash("sha256").update(match[1]).digest("base64");const code=fs.readFileSync("worker/index.js","utf8");fs.writeFileSync("dist/server/index.js",code.replace("__PAGE__",JSON.stringify(page)).replace("__SCRIPT_HASH__",JSON.stringify(hash)))'
if [ -f .openai/hosting.json ]; then
  cp .openai/hosting.json dist/.openai/hosting.json
else
  printf "{}\n" > dist/.openai/hosting.json
fi
