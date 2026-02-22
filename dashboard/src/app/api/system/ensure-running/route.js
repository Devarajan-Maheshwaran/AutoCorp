import { NextResponse } from 'next/server';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

function isPortOpen(port, host = '127.0.0.1', timeout = 700) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startProcess(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
  });
  child.unref();
}

async function ensureService(service) {
  const alreadyUp = await isPortOpen(service.port);
  if (alreadyUp) {
    return { name: service.name, port: service.port, action: 'already_running' };
  }

  startProcess('node', service.args, service.cwd);

  for (let i = 0; i < 20; i += 1) {
    await sleep(600);
    const up = await isPortOpen(service.port);
    if (up) {
      return { name: service.name, port: service.port, action: 'started' };
    }
  }

  return { name: service.name, port: service.port, action: 'failed_to_start' };
}

export async function POST() {
  try {
    const workspaceRoot = path.resolve(process.cwd(), '..');

    const services = [
      {
        name: 'mock-apis',
        port: 3001,
        cwd: path.join(workspaceRoot, 'mock-apis'),
        args: ['src/server.js'],
      },
      {
        name: 'logistics-agent',
        port: 3002,
        cwd: path.join(workspaceRoot, 'logistics-agent'),
        args: ['agent.js'],
      },
      {
        name: 'procurement-agent',
        port: 3003,
        cwd: path.join(workspaceRoot, 'procurement-agent'),
        args: ['agent.js'],
      },
      {
        name: 'sales-agent',
        port: 3004,
        cwd: path.join(workspaceRoot, 'sales-agent'),
        args: ['agent.js'],
      },
    ];

    const results = [];
    for (const service of services) {
      const result = await ensureService(service);
      results.push(result);
    }

    const ok = results.every((r) => r.action !== 'failed_to_start');
    return NextResponse.json({ status: ok ? 'ok' : 'partial', results }, { status: ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error?.message || 'Unknown startup error' },
      { status: 500 }
    );
  }
}
