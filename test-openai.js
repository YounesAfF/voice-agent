import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const ws = new WebSocket('wss://api.openai.com/v1/realtime', {
    headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
    }
});

ws.on('open', () => {
    console.log('Connected to OpenAI');
    ws.close();
});

ws.on('error', (error) => {
    console.error('Error:', error);
});