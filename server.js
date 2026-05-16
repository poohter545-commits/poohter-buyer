const http = require("http");
const fs = require("fs");
const path = require("path");

const root = fs.existsSync(path.join(__dirname, "dist")) ? path.join(__dirname, "dist") : __dirname;
const port = process.env.PORT || 8080;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const server = http.createServer((req, res) => {
  const safePath = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const filePath = path.join(root, safePath);
  const resolved = filePath.startsWith(root) && fs.existsSync(filePath) ? filePath : path.join(root, "index.html");
  const ext = path.extname(resolved);

  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  fs.createReadStream(resolved).pipe(res);
});

server.listen(port, () => {
  console.log(`Poohter buyer website running on http://localhost:${port}`);
});
