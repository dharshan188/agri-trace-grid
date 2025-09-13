# Farm-to-Fork Transparency Backend

A production-ready Node.js/TypeScript backend for supply chain transparency with blockchain integration, designed for SIH25045 hackathon.

## 🚀 Quick Start

```bash
# 1. Clone and install
git clone <YOUR_REPO_URL>
cd farm-to-fork-backend
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your configuration

# 3. Start MongoDB
docker-compose up -d

# 4. Seed database
npm run seed

# 5. Start development server
npm run dev

# 6. (Optional) Start local blockchain
npm run hardhat:node
# In another terminal:
npm run hardhat:deploy
npm run anchor
```

## 📁 Project Structure

```
src/
├── config/         # Database, Swagger configuration
├── middleware/     # Auth, error handling, logging
├── models/         # MongoDB schemas
├── routes/         # API endpoints
├── services/       # Business logic (Merkle, Weather, Storage)
├── utils/          # Crypto, logging utilities
└── types/          # TypeScript interfaces

contracts/          # Solidity smart contracts
scripts/           # Deployment and utility scripts
tests/             # Unit and integration tests
```

## 🛠 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run seed         # Seed database with sample data
npm run hardhat:node # Start local Hardhat blockchain
npm run hardhat:deploy # Deploy contracts
npm run anchor       # Anchor Merkle root to blockchain
```

## 🔧 Environment Configuration

Key environment variables in `.env`:

```bash
# Database
MONGO_URI=mongodb://localhost:27017/farm-to-fork

# Authentication
JWT_SECRET=your-secret-key

# External APIs
WEATHER_API_KEY=your-openweather-api-key
INFURA_PROJECT_ID=your-infura-id

# Blockchain
HARDHAT_URL=http://127.0.0.1:8545
PRIVATE_KEY=your-private-key

# Mock Mode (for demo without external APIs)
MOCK_MODE=true
```

## 📚 API Documentation

- **Local**: http://localhost:3001/api-docs
- **Health Check**: http://localhost:3001/api/health

### Key Endpoints

- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login
- `POST /api/batches` - Create batch (farmers)
- `GET /api/batches/:id` - Get batch details
- `POST /api/batches/:id/events` - Add timeline event
- `POST /api/verify` - Verify batch authenticity
- `GET /api/admin/anomalies` - Get flagged anomalies
- `POST /api/ai/grade` - AI crop grading

## 🔐 Authentication & Roles

JWT-based auth with 4 roles:
- **Farmer**: Create batches, view own batches
- **Aggregator**: Add events to batches, transport updates
- **Consumer**: View batch information, verify authenticity
- **Admin**: System monitoring, anomaly management

## 🌐 Blockchain Integration

- **Local Development**: Hardhat network (localhost:8545)
- **Contract**: Simple Merkle root anchoring
- **Fallback**: Merkle tree verification without blockchain

## 🎯 Features

### ✅ Core Features
- User management with role-based access
- Batch creation with QR code generation
- Timeline tracking with event logging
- Cryptographic signatures and Merkle proofs
- Weather API integration
- Mock AI grading service
- Anomaly detection system

### ✅ Security Features
- JWT authentication
- ECDSA signature verification
- Merkle tree integrity
- Input validation with Joi
- CORS protection

### ✅ Developer Experience
- TypeScript throughout
- Comprehensive API documentation
- Unit tests with Jest
- Docker support
- Detailed logging

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Test specific module
npm test -- --testPathPattern=crypto
```

## 📦 Production Deployment

1. **Build**: `npm run build`
2. **Environment**: Configure production `.env`
3. **Database**: Setup MongoDB Atlas or managed instance
4. **Blockchain**: Connect to testnet/mainnet
5. **Start**: `npm start`

## 🔍 Monitoring & Health

- Health endpoint: `/api/health`
- Detailed metrics: `/api/health/detailed`
- Logging with Winston
- Error tracking and reporting

## 🎭 Demo Mode

Set `MOCK_MODE=true` to run without external dependencies:
- Mock weather data
- Mock IPFS storage
- Mock AI grading
- Local-only blockchain simulation

Perfect for hackathon demos and development!

## 🤝 Frontend Integration

CORS configured for:
- http://localhost:3000 (React default)
- http://localhost:5173 (Vite default)

Example frontend fetch:
```javascript
const response = await fetch('http://localhost:3001/api/batches', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(batchData)
});
```

## 📋 Postman Collection

Import `postman_collection.json` for ready-to-use API requests with authentication examples.

## 🏆 Hackathon Ready

This backend is designed for rapid integration:
- ⚡ 5-minute setup with Docker
- 🔄 Mock mode for offline demos
- 📖 Complete API documentation
- 🧪 Pre-seeded test data
- 🎯 Production-quality code structure

Built for **SIH25045 - Farm-to-Fork Transparency** challenge.

## 📄 License

MIT License - Perfect for hackathon and commercial use.