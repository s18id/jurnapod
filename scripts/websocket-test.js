#!/usr/bin/env node
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// WebSocket Test Script
// Usage: node scripts/websocket-test.js [companyId] [userId]

const WebSocket = require('ws');

const DEFAULT_COMPANY_ID = process.argv[2] || '1';
const DEFAULT_USER_ID = process.argv[3] || '1';
const WS_URL = process.env.WS_URL || 'ws://localhost:3001/ws';

console.log('='.repeat(50));
console.log('WebSocket Test Script');
console.log('='.repeat(50));
console.log(`URL: ${WS_URL}`);
console.log(`Company ID: ${DEFAULT_COMPANY_ID}`);
console.log(`User ID: ${DEFAULT_USER_ID}`);
console.log('='.repeat(50));

// Create WebSocket connection with token
const token = `${DEFAULT_USER_ID}_${DEFAULT_COMPANY_ID}_test_token`;
const ws = new WebSocket(`${WS_URL}?token=${token}`, {
  handshakeTimeout: 5000,
});

let isAuthenticated = false;
let isSubscribed = false;
const messageCount = { sent: 0, received: 0 };

ws.on('open', () => {
  console.log('\n✓ Connection opened');
  console.log('  Waiting for auth challenge...');
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  messageCount.received++;
  
  console.log(`\n← Received (${messageCount.received}):`, JSON.stringify(message, null, 2));

  // Handle auth response
  if (message.type === 'connected') {
    console.log('\n→ Sending auth message...');
    ws.send(JSON.stringify({ type: 'auth', token }));
  }
  
  if (message.type === 'auth_success') {
    isAuthenticated = true;
    console.log('\n✓ Authentication successful!');
    console.log(`  User ID: ${message.userId}`);
    console.log(`  Company ID: ${message.companyId}`);
    
    // Subscribe to company room
    console.log('\n→ Subscribing to company room...');
    ws.send(JSON.stringify({ 
      type: 'subscribe', 
      room: `company:${DEFAULT_COMPANY_ID}` 
    }));
  }
  
  if (message.type === 'subscribed') {
    isSubscribed = true;
    console.log('\n✓ Subscribed to room:', message.room);
    
    // Start testing
    runTests();
  }
  
  if (message.type === 'error') {
    console.log('\n✗ Error:', message.message);
  }

  if (message.type === 'export:completed') {
    console.log('\n🎉 Export completed event received!');
    console.log('  Data:', JSON.stringify(message.data, null, 2));
  }

  if (message.type === 'transaction:created') {
    console.log('\n💰 New transaction event received!');
    console.log('  Data:', JSON.stringify(message.data, null, 2));
  }
});

ws.on('close', (code, reason) => {
  console.log('\n' + '='.repeat(50));
  console.log(`Connection closed: ${code} - ${reason.toString()}`);
  console.log('='.repeat(50));
  process.exit(code === 1000 ? 0 : 1);
});

ws.on('error', (error) => {
  console.error('\n✗ WebSocket error:', error.message);
  process.exit(1);
});

ws.on('ping', () => {
  console.log('← Ping received');
});

ws.on('pong', () => {
  console.log('← Pong received');
});

function runTests() {
  console.log('\n' + '='.repeat(50));
  console.log('Running Tests...');
  console.log('='.repeat(50));
  
  // Test 1: Send ping
  setTimeout(() => {
    console.log('\n→ Test 1: Sending ping...');
    ws.send(JSON.stringify({ type: 'ping' }));
    messageCount.sent++;
  }, 500);
  
  // Test 2: Subscribe to invalid room (should fail)
  setTimeout(() => {
    console.log('\n→ Test 2: Subscribing to invalid room (should fail)...');
    ws.send(JSON.stringify({ 
      type: 'subscribe', 
      room: 'company:99999' 
    }));
    messageCount.sent++;
  }, 1000);
  
  // Test 3: Send message without auth (should fail)
  setTimeout(() => {
    console.log('\n→ Test 3: Creating new WebSocket without auth...');
    const ws2 = new WebSocket(WS_URL);
    ws2.on('open', () => {
      ws2.send(JSON.stringify({ type: 'subscribe', room: 'company:1' }));
    });
    ws2.on('message', (data) => {
      const msg = JSON.parse(data);
      console.log('  Response:', msg.type, '-', msg.message || 'OK');
      if (msg.type === 'error') {
        console.log('  ✓ Test passed: Unauthenticated request rejected');
      }
      ws2.close();
    });
  }, 1500);
  
  // Test 4: Send heartbeat
  setTimeout(() => {
    console.log('\n→ Test 4: Testing heartbeat...');
    ws.send(JSON.stringify({ type: 'ping' }));
    messageCount.sent++;
  }, 2000);
  
  // Summary
  setTimeout(() => {
    console.log('\n' + '='.repeat(50));
    console.log('Test Summary');
    console.log('='.repeat(50));
    console.log(`Messages sent: ${messageCount.sent}`);
    console.log(`Messages received: ${messageCount.received}`);
    console.log(`Authenticated: ${isAuthenticated ? '✓' : '✗'}`);
    console.log(`Subscribed: ${isSubscribed ? '✓' : '✗'}`);
    console.log('='.repeat(50));
    
    if (isAuthenticated && isSubscribed) {
      console.log('\n✅ All basic tests passed!');
    } else {
      console.log('\n❌ Some tests failed');
    }
    
    console.log('\nKeeping connection open for 30 seconds...');
    console.log('Press Ctrl+C to exit\n');
  }, 3000);
  
  // Auto close after 35 seconds
  setTimeout(() => {
    console.log('\nClosing connection...');
    ws.close(1000, 'Test complete');
  }, 35000);
}
