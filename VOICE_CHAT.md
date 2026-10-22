# Real-Time Voice Chat in Ace

This application features free, real-time peer-to-peer voice chat powered by native browser WebRTC and Socket.IO signaling.

## Features

- **100% Free & Open Source**: No third-party paid APIs (Agora, Twilio, LiveKit Cloud).
- **Peer-to-Peer Mesh**: Audio streams travel directly between player devices over encrypted SRTP/DTLS using the Opus audio codec (~28 kbps).
- **Zero Server Recording**: Audio is never recorded, buffered, or stored on the server.
- **Microphone Permission on Demand**: Microphone access is only prompted when a user clicks "Join Voice", never on page load.
- **Full User Controls**:
  - **Mute / Unmute**: Toggle microphone on/off.
  - **Deafen / Undeafen**: Mute incoming audio.
  - **Join / Leave**: Completely optional — users can participate silently.
- **Real-Time Visual Indicators**:
  - Live animated speaking indicators (calculated client-side via Web Audio API with zero network overhead).
  - Microphone muted / active badge on user pods and room list.
- **Mobile & Desktop Support**: Handles iOS Safari, Android Chrome, and desktop autoplay policies seamlessly.

## Configuration & Environment Variables

The server dynamically configures ICE servers:

```bash
# Default: Uses Google's free global STUN servers
# stun:stun.l.google.com:19302

# Custom ICE Servers (Optional)
ICE_SERVERS='[{"urls":["stun:stun.l.google.com:19302"]}]'

# TURN Relay Configuration (Optional - for strict firewalls/Symmetric NAT)
TURN_URL='turn:your-turn-server.com:3478'
TURN_USERNAME='username'
TURN_CREDENTIAL='password'
```

## Running Locally

```bash
# In the root directory:
npm start

# Open in browser:
http://localhost:3001
```
