# Crest.Ai — AEO Pre-Publish Scorer

> Pre-publish analysis for teams that want to know whether a live page is ready for answer engines before it ships.

![AEO Product Overview](docs/assets/product-overview.svg)

---

## Table of Contents

- [What Is Crest.Ai?](#what-is-crestaai)
- [The Problem](#the-problem)
- [How It Works](#how-it-works)
- [Core Workflow](#core-workflow)
- [System Architecture](#system-architecture)
- [Product Capabilities](#product-capabilities)
- [Tech Stack](#tech-stack)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## What Is Crest.Ai?

Crest.Ai helps teams evaluate whether a webpage is:

- **Structurally reusable** by answer engines
- **Strong enough** on content quality and extractability
- **Aligned** to a specific high-value query
- **Ready** for rewriting, optimization, or launch

Instead of waiting for rankings or traffic signals after publication, Crest.Ai gives teams a **pre-publish decision layer**.

## The Problem

| Traditional SEO | Answer Engine Ready |
|---|---|
| Optimized for keyword rankings | Optimized for entity extraction |
| Built for human readers | Built for AI systems |
| Publish first, measure later | Score first, publish when ready |

## How It Works

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         CRESTALL.AI SYSTEM ARCHITECTURE             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────────┐        │
│  │          │     │              │     │                  │        │
│  │   User   │────▶│   Frontend   │────▶│   Backend API    │        │
│  │  (URL)   │     │ (React+Vite) │     │  (Express/Node)  │        │
│  │          │     │              │     │                  │        │
│  └──────────┘     └──────────────┘     └──────────────────┘        │
│                                         │    │    │                │
│                                         │    │    │                │
│                                         ▼    ▼    ▼                │
│                                  ┌─────────────┬─────────────┐      │
│                                  │             │             │      │
│                                  ▼             ▼             ▼      │
│                           ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│                           │   Jina   │ │ OpenRouter│ │  Tavily  │   │
│                           │ (Fetch)  │ │(Analysis) │ │ (Search) │   │
│                           └──────────┘ └──────────┘ └──────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Workflow

1. **Paste a live URL** — The user inputs the page they want to evaluate.
2. **Fetch** — Normalize page content as markdown via Jina.
3. **Baseline Scoring** — Generate Content, GEU, and LLM baseline scores.
4. **Technical Audit** — Check for schema and `llms.txt`.
5. **Query Testing** — Test against a target query for direct-answer quality.
6. **Gap Analysis** — Compare model verdicts to identify the highest-impact fix.
7. **Refinement** — Use the built-in *Ask The Expert* feature to guide rewrites.

## System Architecture

Crest.Ai is built as a modern full-stack application:

### Frontend Layer
- React 19 + Vite SPA with TypeScript
- Real-time score updates via Server-Sent Events (SSE)
- Interactive dashboard with visual scoring gauges

### Backend Layer
- Express.js API server (Node.js)
- Stateless scoring endpoints
- Streaming responses for live model output

### External Services
| Service | Role | Purpose |
|---------|------|--------|
| Jina AI | Content Fetcher | Converts live URLs to normalized markdown |
| OpenRouter | Analysis Models | Multi-LLM scoring (Llama, Nemotron, GPT OSS) |
| Tavily | Search & Evidence | Competitor analysis and query context |

## Product Capabilities

| Capability | Description |
|---|---|
| **Live Page Fetch** | Pulls content and probes `llms.txt` / `llms-full.txt` |
| **Content Score** | Evaluates FAQ structure, citations, schema, and fluency |
| **GEU Score** | Evaluates answer front-loading, standalone sentences, coherence |
| **LLM Baseline** | Uses multiple models (Llama 3.3, Nemotron 120B, GPT OSS) to estimate readiness |
| **Query-Specific Scoring** | Returns a Query Match score and identifies specific content weaknesses |
| **Rewrite Assistance** | Preserves page context for LLM-driven editing guidance |

## Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19, Vite, TypeScript | Interactive SPA with real-time scoring |
| **Backend** | Express.js, Node.js | API server with SSE streaming |
| **LLM Models** | OpenRouter API | Multi-model scoring and verdicts |
| **Content Fetch** | Jina AI API | URL-to-markdown conversion |
| **Search** | Tavily API | Competitor and query context |
| **Testing** | Jest, Vitest | Unit and integration tests |

## Environment Variables

The backend requires the following environment variables:

```bash
GROQ_API_KEY=your_groq_key
OPENROUTER_API_KEY=your_openrouter_key
JINA_API_KEY=your_jina_key
TAVILY_API_KEY=your_tavily_key
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- API keys for Groq, OpenRouter, Jina, and Tavily

### Installation

```bash
# Clone the repository
git clone https://github.com/BUVKAUSHIK/Crest.Ai.git
cd Crest.Ai

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

### Running Locally

```bash
# Terminal 1: Start the backend
cd backend
npm run dev

# Terminal 2: Start the frontend
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Deployment

### Frontend
Deploy the frontend on Vercel or Netlify. No special configuration required — it's a standard Vite SPA.

### Backend
The Express backend can be deployed on any Node.js hosting platform (Railway, Flynn, Fly.io, etc.). Set the environment variables in your hosting platform.

## Contributing

Contributions are welcome! Please follow the standard workflow:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the `LICENSE` file for details.
