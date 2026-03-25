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

// Default ports from env or fallback
const apiPort = parseInt(process.env.PORT || process.env.API_PORT || '3001', 10);
const backofficePort = parseInt(process.env.BACKOFFICE_PORT || '3002', 10);
const posPort = parseInt(process.env.POS_PORT || '5173', 10);
const ports = [apiPort, backofficePort, posPort, 5174]; // 5174 is backup POS port

console.log('🛑 Stopping all development processes...\n');

async function killProcessesByPattern(pattern, description) {
  try {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Windows implementation
      const { stdout } = await execAsync(
        `wmic process where "CommandLine like '%${pattern}%'" get ProcessId,CommandLine /format:csv`,
        { encoding: 'utf8' }
      );
      
      const lines = stdout.trim().split('\n').slice(1); // Skip header
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const pid = parts[1];
          if (pid && !isNaN(pid)) {
            await execAsync(`taskkill /PID ${pid} /F`);
            console.log(`✓ Killed ${description} (PID: ${pid})`);
          }
        }
      }
    } else {
      // Unix/Linux implementation
      try {
        const { stdout } = await execAsync(`pgrep -f "${pattern}"`, { encoding: 'utf8' });
        const pids = stdout.trim().split('\n').filter(Boolean);
        
        if (pids.length > 0) {
          for (const pid of pids) {
            try {
              await execAsync(`kill -TERM ${pid}`);
              console.log(`✓ Killed ${description} (PID: ${pid})`);
            } catch (error) {
              // Process might have already exited, try force kill
              try {
                await execAsync(`kill -9 ${pid}`);
                console.log(`✓ Force killed ${description} (PID: ${pid})`);
              } catch (forceError) {
                // Process already gone
              }
            }
          }
        }
      } catch (error) {
        // pgrep might not be available, try alternative approach
        try {
          const { stdout } = await execAsync(`ps aux | grep "${pattern}" | grep -v grep | awk '{print $2}'`, { encoding: 'utf8' });
          const pids = stdout.trim().split('\n').filter(Boolean);
          
          if (pids.length > 0) {
            for (const pid of pids) {
              try {
                await execAsync(`kill -TERM ${pid}`);
                console.log(`✓ Killed ${description} (PID: ${pid})`);
              } catch (killError) {
                try {
                  await execAsync(`kill -9 ${pid}`);
                  console.log(`✓ Force killed ${description} (PID: ${pid})`);
                } catch (forceError) {
                  // Process already gone
                }
              }
            }
          }
        } catch (altError) {
          // No processes found or command failed
        }
      }
    }
  } catch (error) {
    // No processes found matching pattern
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
    // No process on port
  }
}

// Kill development processes in order
console.log('📋 Killing development processes by pattern:');

// 1. Kill concurrently orchestrator processes
await killProcessesByPattern('concurrently.*dev', 'concurrently orchestrator');

// 2. Kill nodemon processes
await killProcessesByPattern('nodemon.*src/server.ts', 'nodemon API server');
await killProcessesByPattern('nodemon', 'nodemon processes');

// 3. Kill tsx server processes
await killProcessesByPattern('tsx.*src/server.ts', 'tsx API server');

// 4. Kill Vite dev servers
await killProcessesByPattern('vite.*--host', 'Vite dev servers');

// 5. Kill npm dev processes
await killProcessesByPattern('npm.*dev', 'npm dev processes');

// 6. Kill TypeScript watch processes
await killProcessesByPattern('tsc.*--watch', 'TypeScript watch processes');

console.log('\n📋 Killing processes by port:');

// Kill processes on known development ports
for (const port of ports) {
  await killPort(port);
}

// Wait a moment for processes to clean up
await new Promise(resolve => setTimeout(resolve, 1000));

console.log('\n📋 Final cleanup check:');

// Final check for any remaining processes
const remainingPatterns = [
  'concurrently.*dev',
  'nodemon',
  'tsx.*server',
  'vite.*dev',
  'npm.*dev'
];

let foundRemaining = false;
for (const pattern of remainingPatterns) {
  try {
    let stdout = '';
    try {
      const result = await execAsync(`pgrep -f "${pattern}"`, { encoding: 'utf8' });
      stdout = result.stdout;
    } catch (pgrepError) {
      // pgrep might not be available, try ps
      const result = await execAsync(`ps aux | grep "${pattern}" | grep -v grep | awk '{print $2}'`, { encoding: 'utf8' });
      stdout = result.stdout;
    }
    
    const pids = stdout.trim().split('\n').filter(Boolean);
    if (pids.length > 0) {
      foundRemaining = true;
      console.log(`⚠️  Found remaining ${pattern} processes: ${pids.join(', ')}`);
      
      // Force kill remaining processes
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`✓ Force killed remaining process (PID: ${pid})`);
        } catch (error) {
          // Process already gone
        }
      }
    }
  } catch (error) {
    // No processes found
  }
}

if (!foundRemaining) {
  console.log('✅ All development processes stopped cleanly');
}

console.log('\n🎉 Development environment cleanup complete!');