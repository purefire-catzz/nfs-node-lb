import http from 'http';

// Configuration
const NODES = {
  EU: 'nfs-node-eu.novisurf.top',
  US: 'nfs-node-vir.novisurf.top'
};

// Optimization: Persistent connections to regional nodes
const agentSettings = { keepAlive: true, maxSockets: 100 };
const euAgent = new http.Agent(agentSettings);
const usAgent = new http.Agent(agentSettings);

const server = http.createServer(async (req, res) => {
  // 1. Health Check
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200);
    return res.end('LB-ONLINE');
  }

  // 2. Geo-Routing Logic
  // Cloudflare provides 'cf-ipcountry'. If not available, we default to US.
  const country = req.headers['cf-ipcountry'];
  const euCountries = ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL']; // Add more as needed
  
  const isEU = euCountries.includes(country);
  const targetHost = isEU ? NODES.EU : NODES.US;
  const targetAgent = isEU ? euAgent : usAgent;

  console.log(`[ROUTE]: ${country || 'Unknown'} -> ${targetHost}${req.url}`);

  // 3. Optimized Proxy Request
  const proxyReq = http.request({
    hostname: targetHost,
    port: 80, // or 443 if using https (requires 'https' module)
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetHost, // Vital for AWS App Runner to recognize the request
      'X-Forwarded-For': req.headers['cf-connecting-ip'] || req.socket.remoteAddress
    },
    agent: targetAgent
  }, (proxyRes) => {
    // Pipe the response headers and body back to the user
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy Error: ${err.message}`);
    res.writeHead(502);
    res.end('Gateway Error');
  });

  // Pipe the incoming request body (if any) to the proxy
  req.pipe(proxyReq);
});

server.listen(8080, '0.0.0.0', () => {
  console.log('🌍 Global Load Balancer Active on Port 8080');
});
