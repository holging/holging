# Holging — Project Rules

## Deployment

- **Production:** https://holging.com
- **VPS:** `root@VPS_IP`
- **Web root:** `/var/www/holging/`
- **Deploy command:** `rsync -avz --delete ~/Projects/holging/app/dist/ root@VPS_IP:/var/www/holging/`
- **Server:** nginx + Let's Encrypt SSL
- **Always build before deploy:** `cd ~/Projects/holging/app && npm run build`
- Netlify (holging.netlify.app) is a backup mirror, NOT primary

## Project Structure

- **Repo:** https://github.com/holging/holging
- **Local path:** `~/Projects/holging`
- **Smart contract:** `programs/holging/` (Anchor/Rust)
- **Frontend:** `app/` (React + Vite)
- **MCP Server:** `mcp-server/` (Node.js, 11 tools for AI agent trading)
- **IDL:** `app/src/idl/holging.json` and `mcp-server/idl/holging.json`
- **Network:** Solana Devnet
- **Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`

## Deploy Checklist

1. `cd ~/Projects/holging/app && npm run build`
2. `rsync -avz --delete ~/Projects/holging/app/dist/ root@VPS_IP:/var/www/holging/`
3. Verify: open https://holging.com

## Naming

- The project is called **Holging**, not solshort
- Token names: shortSOL, shortTSLA, shortSPY, shortAAPL (these are correct, not "solshort")
- GitHub org: `holging`
