// Tiny env-file runner so npm scripts can point at .env.staging (or any
// other file) without adding a dotenv-cli dependency — `dotenv` itself is
// already installed, just not as a CLI. Usage:
//   node scripts/with-env.mjs .env.staging -- next dev
import { config } from "dotenv"
import { spawn } from "node:child_process"

const [envFile, ...rest] = process.argv.slice(2)
const args = rest[0] === "--" ? rest.slice(1) : rest
if (!envFile || args.length === 0) {
  console.error("Usage: node scripts/with-env.mjs <env-file> -- <command> [args...]")
  process.exit(1)
}

config({ path: envFile })

const [cmd, ...cmdArgs] = args
const child = spawn(cmd, cmdArgs, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
})
child.on("exit", (code) => process.exit(code ?? 1))
