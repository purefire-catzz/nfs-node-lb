import https from 'https';
import http from 'http';

// --- CONFIGURATION ---
const NODES = {
  EU: 'nfs-node-eu.novisurf.top',
  US: 'nfs-node-vir.novisurf.top',
  SG: 'nfs-node-sg.novisurf.top' // New Singapore Node
};

// Optimization: Persistent SSL connections (Essential for sub-100ms performance)
const agentSettings = { 
  keepAlive: true, 
  maxSockets: 100, 
  scheduling: 'fifo' 
};

const agents = {
  EU: new https.Agent(agentSettings),
  US: new https.Agent(agentSettings),
  SG: new https.Agent(agentSettings)
};

const server = http.createServer(async (req, res) => {
  // 1. FAST PATH: Health Check
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('LB-ONLINE');
  }

  // 2. GEO-ROUTING LOGIC
  const country = req.headers['cf-ipcountry'] || 'US';
  
  // Define regional clusters
  const euRegion = ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL', 'SE', 'NO', 'FI', 'IE'];
  const sgRegion = ['SG', 'JP', 'KR', 'HK', 'CN', 'AU', 'IN', 'TH', 'MY', 'ID', 'PH', 'VN'];

  let targetKey = 'US'; // Default
  if (euRegion.includes(country)) targetKey = 'EU';
  if (sgRegion.includes(country)) targetKey = 'SG';

  const targetHost = NODES[targetKey];
  const targetAgent = agents[targetKey];

  // 3. PROXY EXECUTION
  // Note: App Runner requires HTTPS (Port 443)
  const proxyOptions = {
    hostname: targetHost,
    port: 443,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetHost, // Vital for virtual hosting / SNI
      'X-Forwarded-For': req.headers['cf-connecting-ip'] || req.socket.remoteAddress,
      'X-Novi-Region': targetKey // Internal debugging header
    },
    agent: targetAgent,
    timeout: 10000 // 10s timeout
  };

  const proxyReq = https.request(proxyOptions, (proxyRes) => {
    // Stream headers and body back to user immediately
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  // Handle network/timeout errors
  proxyReq.on('error', (err) => {
    console.error(`[${targetKey}] Proxy Error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end('Novi Gateway Error');
    }
  });

  // Pipe the incoming request body to the regional origin
  req.pipe(proxyReq);
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Global LB Online | Routing to: US, EU, SG | Port: ${PORT}`);
});
