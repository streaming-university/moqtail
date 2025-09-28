# MOQtail

Draft 11-compliant Media-over-QUIC (MoQ) libraries for publisher, subscriber (moqtail-ts) and relay (moqtail-rs) components with a sample application using the Low Overhead Media Container (LOC) format.

## moqtail-ts (MOQtail TypeScript Library)

The TypeScript client library for Media-over-QUIC (MoQ) applications, designed for seamless integration with WebTransport and MoQ relay servers.

### ✨ Features

- 🛡️ **TypeScript**: Type-safe development
- 🔗 **WebTransport**: Next-gen transport protocol support
- 🔥 **Hot Module Reloading**: Instant feedback during development

README available at: [moqtail-ts/README.md](libs/moqtail-ts/README.md)

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/)
- [MOQtail Relay](apps/relay) running with valid certificates

### Installation

```bash
# Clone the repository (if not already)
git clone https://github.com/streaming-university/moqtail.git

cd moqtail

# Install dependencies
npm install
```

### Running the Development Server

```bash
cd ./apps/client-js

# Install dependencies
npm install

# Run the development server
npm run dev
```

### Running the Relay

```bash
cd ./apps/relay

cargo run --bin relay -- --port 4433 --cert-file cert/cert.pem --key-file cert/key.pem
```

The app will be available at [http://localhost:5173](http://localhost:5173) by default.

### Running the MOQtail Room Server

```bash
cd ./apps/room-server

# Install dependencies
npm install

# Run the development MOQtail Room Server
npm run start
# or
npm run dev # for nodemon hot-reload
```

The app will be available at [http://localhost:5173](http://localhost:5173) by default.

## 🛠️ Sample Project Structure

```
apps/client-js/

├── public
│   ├── ...
├── src
│   ├── App.tsx
│   ├── composables
│   │   └── useVideoPipeline.ts
│   ├── contexts
│   │   └── SessionContext.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── pages
│   │   ├── JoinPage.tsx
│   │   └── SessionPage.tsx
│   ├── sockets
│   │   └── SocketContext.tsx
│   ├── startup.ts
│   ├── types
│   │   ├── AppSettings.ts
│   │   └── types.ts
│   ├── videoUtils.ts
│   ├── vite-env.d.ts
│   └── workers
│       ├── decoderWorker.ts
│       └── pcmPlayerProcessor.js
├── ...

```

## ⚙️ Configuration

- **WebTransport**: Ensure your browser supports WebTransport and that you have trusted the local CA, see [relay/cert/README.md](apps/relay/cert/README.md)
- **Environment Variables**: You can configure endpoints and other settings in `.env` files.

## 🤝 Contributing

Contributions are welcome! Please open issues or submit pull requests for improvements, bug fixes, or documentation updates.

## 📄 License

[MIT](LICENSE-MIT)
[APACHE](LICENSE-APACHE)
