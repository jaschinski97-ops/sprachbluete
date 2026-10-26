const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');
// Ein Blütenblatt, zeigt nach oben, Ansatz in der Mitte (0,0), Kerbe an der Spitze.
const blatt = 'M0 18 C -78 -30, -112 -150, -70 -232 Q -40 -270, -14 -246 L 0 -214 L 14 -246 Q 40 -270, 70 -232 C 112 -150, 78 -30, 0 18 Z';
function bluete({ cx, cy, s, mitStaubgefaessen = true, einfarbig = null }) {
  const blaetter = [0, 72, 144, 216, 288].map((w) =>
    `<path d="${blatt}" transform="translate(${cx} ${cy}) rotate(${w}) scale(${s})" fill="${einfarbig ?? 'url(#blatt)'}" ${einfarbig ? '' : 'stroke="#F49CC4" stroke-width="6"'}/>`).join('');
  const adern = einfarbig ? '' : [0, 72, 144, 216, 288].map((w) =>
    `<path d="M0 -20 L0 -150" transform="translate(${cx} ${cy}) rotate(${w}) scale(${s})" stroke="#F49CC4" stroke-width="5" stroke-linecap="round" opacity="0.55"/>`).join('');
  const staub = !mitStaubgefaessen ? '' : Array.from({ length: 10 }, (_, i) => {
    const w = i * 36 + 18; const r = 62 * s;
    const x = cx + Math.sin(w * Math.PI / 180) * r, y = cy - Math.cos(w * Math.PI / 180) * r;
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${einfarbig ?? '#E0558F'}" stroke-width="${7 * s}" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="${11 * s}" fill="${einfarbig ?? '#FFE27A'}"/>`;
  }).join('');
  const kern = `<circle cx="${cx}" cy="${cy}" r="${30 * s}" fill="${einfarbig ?? '#E0558F'}"/>`;
  return blaetter + adern + staub + kern;
}
function blase({ x, y, s, einfarbig = null }) {
  // Sprechblase in Jade mit drei Punkten, Spitze nach links unten.
  const fill = einfarbig ?? 'url(#jade)';
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M -120 -78 Q -120 -112 -86 -112 L 86 -112 Q 120 -112 120 -78 L 120 30 Q 120 64 86 64 L -30 64 L -86 112 L -74 64 L -86 64 Q -120 64 -120 30 Z" fill="${fill}" ${einfarbig ? '' : 'filter="url(#schatten)"'}/>
    ${einfarbig ? '' : [-50, 0, 50].map((dx) => `<circle cx="${dx}" cy="-24" r="16" fill="#042F2E"/>`).join('')}
  </g>`;
}
const defs = `<defs>
  <radialGradient id="himmel" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#1B3358"/><stop offset="0.55" stop-color="#0E1C33"/><stop offset="1" stop-color="#070D1A"/></radialGradient>
  <radialGradient id="schein" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#F49CC4" stop-opacity="0.45"/><stop offset="1" stop-color="#F49CC4" stop-opacity="0"/></radialGradient>
  <linearGradient id="blatt" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFF4F8"/><stop offset="1" stop-color="#FFC2DB"/></linearGradient>
 <filter id="schatten" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#04101F" flood-opacity="0.7"/></filter>
  <linearGradient id="jade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#99F6E4"/><stop offset="1" stop-color="#2DD4BF"/></linearGradient>
</defs>`;
const BL = { cx: 486, cy: 480, s: 1.12 };
const BB = { x: 750, y: 742, s: 0.95 };
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs}
  <rect width="1024" height="1024" fill="url(#himmel)"/>
  <circle cx="${BL.cx}" cy="${BL.cy}" r="400" fill="url(#schein)"/>
  ${bluete(BL)}${blase(BB)}</svg>`;
// Android: Vordergrund transparent, im sicheren Kreis (66 %), Hintergrund nur Himmel, Monochrom einfarbig.
const vg = (inhalt) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs}<g transform="translate(512 512) scale(0.66) translate(-512 -512)">${inhalt}</g></svg>`;
const fore = vg(bluete(BL) + blase(BB));
const mono = vg(bluete({ ...BL, einfarbig: '#FFFFFF' }) + blase({ ...BB, einfarbig: '#FFFFFF' }));
const back = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 1024 1024">${defs}<rect width="1024" height="1024" fill="url(#himmel)"/><circle cx="486" cy="480" r="400" fill="url(#schein)"/></svg>`;
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 1024 1024">${defs}${bluete(BL)}${blase(BB)}</svg>`;
const out = process.argv[2];
const render = (svg, name, w) => fs.writeFileSync(`${out}/${name}`, new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng());
render(icon, 'icon.png', 1024); render(fore, 'android-icon-foreground.png', 1024); render(mono, 'android-icon-monochrome.png', 1024);
render(back, 'android-icon-background.png', 512); render(splash, 'splash-icon.png', 600); render(icon, 'favicon.png', 48);
fs.writeFileSync(`${out}/logo.svg`, icon);
console.log('ok');
