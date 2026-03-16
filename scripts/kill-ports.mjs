#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const execAsync = promisify(exec);

// Load .env for port discovery
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch (error) {
    // .env not found, use defaults
  }
}

loadEnv();

const ports = process.argv.slice(2).map(p => parseInt(p, 10));

// Default ports from env or fallback
if (ports.length === 0) {
  const apiPort = parseInt(process.env.PORT || process.env.API_PORT || '3001', 10);
  const backofficePort = parseInt(process.env.BACKOFFICE_PORT || '3002', 10);
  const posPort = parseInt(process.env.POS_PORT || '5173', 10);
  ports.push(apiPort, backofficePort, posPort);
}

// Validate ports
for (const port of ports) {
  if (isNaN(port) || port < 1024 || port > 65535) {
    console.error(`❌ Invalid port: ${port}`);
    process.exit(1);
  }
}

async function killPort(port) {
  try {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      const { stdout } = await execAsync(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        { encoding: 'utf8' }
      );
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && !isNaN(pid)) {
          await execAsync(`taskkill /PID ${pid} /F`);
          console.log(`✓ Killed process on port ${port} (PID: ${pid})`);
        }
      }
    } else {
      const { stdout } = await execAsync(`lsof -ti:${port}`, { encoding: 'utf8' });
      const pids = stdout.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        await execAsync(`kill -9 ${pid}`);
        console.log(`✓ Killed process on port ${port} (PID: ${pid})`);
      }
    }
  } catch (error) {
    console.log(`ℹ No process on port ${port}`);
  }
}

for (const port of ports) {
  await killPort(port);
}
