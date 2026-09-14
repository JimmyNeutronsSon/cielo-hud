import { createPanel } from './panel.js';

function initials(name) {
  return name.split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
}

function avatarColor(seed) {
  const colors = ["#5ee7ff", "#8b7cf6", "#ffb3e6", "#ffd58a", "#8bffb0"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h += seed.charCodeAt(i);
  return colors[h % colors.length];
}

export function buildSocial(root, vw, vh, onRemove) {
  const friends = [
    { name: "River Okafor", sub: "Online · Racer X", online: true },
    { name: "Priya Anand", sub: "Last seen 2d ago", online: false },
    { name: "Sam Delacroix", sub: "Last seen 5d ago", online: false }
  ];

  const rows = friends.map(function (f) {
    const c = avatarColor(f.name);
    return `
      <div class="lg-person">
        <div class="lg-avatar" style="background:${c}">${initials(f.name)}</div>
        <span class="lg-status" style="background:${f.online ? "#63ff9a" : "#5b6785"}"></span>
        <div><div class="name">${f.name}</div><div class="sub">${f.sub}</div></div>
      </div>
    `;
  }).join("");

  return createPanel(root, {
    key: "social",
    x: Math.max(24, Math.floor(vw / 2 - 230)),
    y: 70,
    width: 230,
    title: "Friends",
    body: rows
  }, onRemove);
}
