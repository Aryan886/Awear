const { PNG } = require('pngjs');
const fs = require('node:fs');

// Rasterize the app's simple vector monogram; no remote artwork is needed.
function createIcon(file, transparent, monochrome = false) {
  const size = 1024;
  const image = new PNG({ width: size, height: size });
  const purple = [75, 63, 168];
  const mint = [61, 220, 151];
  function segmentDistance(x, y, first, second) {
    const dx = second[0] - first[0];
    const dy = second[1] - first[1];
    const fraction = Math.max(
      0,
      Math.min(1, ((x - first[0]) * dx + (y - first[1]) * dy) / (dx * dx + dy * dy)),
    );
    return Math.hypot(x - first[0] - dx * fraction, y - first[1] - dy * fraction);
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      let color = purple;
      let alpha = transparent ? 0 : 255;
      const shape = Math.min(
        segmentDistance(x, y, [322, 696], [512, 310]),
        segmentDistance(x, y, [512, 310], [702, 696]),
        segmentDistance(x, y, [418, 530], [597, 530]),
      );
      if (shape < 37) {
        color = [255, 255, 255];
        alpha = 255;
      }
      if (Math.hypot(x - 736, y - 330) < 42) {
        color = monochrome ? [255, 255, 255] : mint;
        alpha = 255;
      }
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = alpha;
    }
  }
  fs.writeFileSync(file, PNG.sync.write(image));
}
createIcon('assets/awear-icon.png', false);
createIcon('assets/awear-foreground.png', true);
createIcon('assets/awear-monochrome.png', true, true);
