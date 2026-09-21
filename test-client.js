const WebSocket = require('ws');
const name = process.argv[2] || 'TESTUSER';
const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => {
  console.log('WS open, sending username:', name);
  ws.send(name);
  // request user list
  ws.send('/users');
  // send a public message
  setTimeout(()=> ws.send('Hello from '+name), 1000);
});
ws.on('message', (m)=>{
  console.log('RECV:', m.toString());
});
ws.on('close', ()=> console.log('closed'));
ws.on('error', (e)=> console.error('error', e.message));
