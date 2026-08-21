const fs = require('fs');
const path = require('path');

function pngToIco(pngPath, icoPath) {
  const png = fs.readFileSync(pngPath);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width > 256 || height > 256) {
    throw new Error(`NSIS requires icon PNG <= 256px, got ${width}x${height}`);
  }
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(width >= 256 ? 0 : width, 6);
  header.writeUInt8(height >= 256 ? 0 : height, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  fs.writeFileSync(icoPath, Buffer.concat([header, png]));
}

const root = path.join(__dirname, '..');
const src = path.join(root, 'electron', 'assets', 'icon-256.png');
const dest = path.join(root, 'electron', 'assets', 'icon.ico');
pngToIco(src, dest);
console.log('Wrote', dest);
