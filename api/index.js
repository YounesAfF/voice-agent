import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';

// Load environment variables
dotenv.config();

// Get environment variables and log them (remove sensitive info)
const { 
    OPENAI_API_KEY,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    PORT = 5050 
} = process.env;

console.log('Environment check:', {
    hasOpenAIKey: !!OPENAI_API_KEY,
    hasTwilioSID: !!TWILIO_ACCOUNT_SID,
    hasTwilioToken: !!TWILIO_AUTH_TOKEN,
    port: PORT
});

// Initialize Fastify
const app = Fastify({
    logger: true  // Enable detailed logging
});

// Add global headers to bypass ngrok warning
app.addHook('onRequest', (request, reply, done) => {
    console.log('Incoming request:', {
        url: request.url,
        method: request.method,
        headers: request.headers
    });
    reply.header('ngrok-skip-browser-warning', 'true');
    done();
});

app.register(fastifyFormBody);
app.register(fastifyWs);

// Constants
const SYSTEM_MESSAGE = 'You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested about and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.';
const VOICE = 'alloy';

// Root Route
app.get('/', async (request, reply) => {
    console.log('Root route accessed');
    reply.send({ message: 'Twilio Media Stream Server is running!' });
});

// Route for Twilio to handle incoming calls
app.all('/incoming-call', async (request, reply) => {
    console.log('Incoming call received:', {
        headers: request.headers,
        body: request.body
    });

    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Say>Please wait while we connect your call to the A. I. voice assistant, powered by Twilio and the Open-A.I. Realtime API</Say>
                              <Pause length="1"/>
                              <Say>O.K. you can start talking!</Say>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                          </Response>`;

    console.log('Sending TwiML response:', twimlResponse);
    reply.type('text/xml').send(twimlResponse);
});

// WebSocket route for media-stream
app.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log('WebSocket connection established');

        // Connection-specific state
        let streamSid = null;
        let latestMediaTimestamp = 0;
        let lastAssistantItem = null;
        let markQueue = [];
        let responseStartTimestampTwilio = null;

        // Initialize OpenAI WebSocket
        console.log('Attempting to connect to OpenAI...');
        const openAiWs = new WebSocket('wss://api.openai.com/v1/audio/speech', {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1"
            }
        });

        // Control initial session with OpenAI
        const initializeSession = () => {
            const sessionUpdate = {
                type: 'session.update',
                session: {
                    turn_detection: { type: 'server_vad' },
                    input_audio_format: 'g711_ulaw',
                    output_audio_format: 'g711_ulaw',
                    voice: VOICE,
                    instructions: SYSTEM_MESSAGE,
                    modalities: ["text", "audio"],
                    temperature: 0.8,
                }
            };

            console.log('Initializing OpenAI session');
            openAiWs.send(JSON.stringify(sessionUpdate));
            // Uncomment to have AI speak first:
            sendInitialConversationItem();
        };

        // Send initial conversation item
        const sendInitialConversationItem = () => {
            const initialConversationItem = {
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: 'Greet the user and introduce yourself as an AI assistant.'
                        }
                    ]
                }
            };

            console.log('Sending initial greeting');
            openAiWs.send(JSON.stringify(initialConversationItem));
            openAiWs.send(JSON.stringify({ type: 'response.create' }));
        };

        // OpenAI WebSocket handlers
        openAiWs.on('open', () => {
            console.log('Successfully connected to OpenAI');
            setTimeout(initializeSession, 100);
        });

        openAiWs.on('error', (error) => {
            console.error('OpenAI WebSocket error:', error);
        });

        openAiWs.on('close', () => {
            console.log('OpenAI WebSocket closed');
        });

        // Rest of your existing WebSocket implementation...
        // [Previous WebSocket handlers remain the same]
    });
});

// Start server
// const start = async () => {
//     try {
//         app.listen({ port: PORT, host: '0.0.0.0' });
//         console.log(`Server is running on port ${PORT}`);
//     } catch (err) {
//         console.error('Failed to start server:', err);
//         process.exit(1);
//     }
// };

// start();

export default async function handler(req, reply) {
  await app.ready();
  app.server.emit("request", req, reply);
}