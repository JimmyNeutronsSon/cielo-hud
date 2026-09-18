#!/usr/bin/env bash
set -e

DOMAIN="api.ritebooks.com"

echo "==> Updating system"
sudo apt update && sudo apt upgrade -y

echo "==> Installing Node.js 20, git, nginx, certbot"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx certbot python3-certbot-nginx

echo "==> Opening firewall (ufw + iptables)"
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw allow OpenSSH || true
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || (sudo mkdir -p /etc/iptables && sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null)

echo "==> Setting up app directory"
mkdir -p ~/scramjet-app/public
cd ~/scramjet-app

echo "==> Installing bare server + express"
npm init -y
npm install @tomphttp/bare-server-node express

echo "==> Writing server.js"
cat > server.js << 'EOF'
import express from "express";
import { createBareServer } from "@tomphttp/bare-server-node";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const bare = createBareServer("/bare/");

app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer((req, res) => {
  if (bare.shouldRoute(req)) bare.routeRequest(req, res);
  else app(req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (bare.shouldRoute(req)) bare.routeUpgrade(req, socket, head);
  else socket.end();
});

server.listen(8080, () => console.log("Scramjet app server on :8080"));
EOF

sed -i 's/"type": "commonjs"/"type": "module"/' package.json 2>/dev/null || \
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));p.type='module';fs.writeFileSync('package.json',JSON.stringify(p,null,2));"

echo "==> Cloning and building Scramjet client"
git clone https://github.com/MercuryWorkshop/scramjet.git ~/scramjet-src
cd ~/scramjet-src
npm install
npm run build || echo "!! check ~/scramjet-src for the actual build output dir if this failed, may need 'npm run rewriter/build' variants"

echo "==> Copy built client assets into public/ (adjust if build output dir differs)"
if [ -d "dist" ]; then
  cp -r dist/* ~/scramjet-app/public/
elif [ -d "out" ]; then
  cp -r out/* ~/scramjet-app/public/
else
  echo "!! Could not auto-detect build output folder. Run 'ls ~/scramjet-src' and copy the built client files manually into ~/scramjet-app/public/"
fi

echo "==> Installing pm2 and starting app"
sudo npm install -g pm2
cd ~/scramjet-app
pm2 start server.js --name scramjet
pm2 startup systemd -u $USER --hp $HOME | tail -n 1 | sudo bash || true
pm2 save

echo "==> Configuring nginx (HTTP first, for certbot)"
sudo tee /etc/nginx/sites-available/scramjet > /dev/null << EOF
server {
  listen 80;
  server_name ${DOMAIN};

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
  }
}
EOF

sudo ln -sf /etc/nginx/sites-available/scramjet /etc/nginx/sites-enabled/scramjet
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "==> Requesting TLS cert via certbot (make sure DNS for ${DOMAIN} already points here!)"
sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${USER}@${DOMAIN} --redirect || \
  echo "!! certbot failed — check that ${DOMAIN} resolves to this server's IP, then rerun: sudo certbot --nginx -d ${DOMAIN}"

echo "==> Adding COOP/COEP headers (needed by Scramjet)"
sudo sed -i '/server_name/a\    add_header Cross-Origin-Opener-Policy same-origin;\n    add_header Cross-Origin-Embedder-Policy require-corp;' /etc/nginx/sites-available/scramjet
sudo nginx -t && sudo systemctl reload nginx

echo "==> Done. Visit: https://${DOMAIN}"
