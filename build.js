const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");
const files = ["index.html", "styles.css", "app.js"];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}

fs.writeFileSync(path.join(dist, "env.js"), "window.POOHTER_BUYER_BUILD = true;\n");
console.log(`Built ${files.length} files into ${dist}`);
