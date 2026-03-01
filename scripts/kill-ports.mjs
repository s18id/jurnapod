#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const ports = process.argv.slice(2).map(p => parseInt(p, 10));

// Default ports if none provided
if (ports.length === 0) {
  ports.push(3001, 3002, 5173); // API, Backoffice, POS
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
