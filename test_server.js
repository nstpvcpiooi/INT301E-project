const http = require('http');

const hostname = '127.0.0.1';
const port = 3001; // Dùng cổng khác để tránh xung đột

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello from Simple Node Server!\n');
});

server.listen(port, hostname, () => {
  console.log(`Simple server running at http://${hostname}:${port}/`);
});