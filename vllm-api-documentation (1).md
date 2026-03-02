# Self-Hosted vLLM API Infrastructure

## Overview

Two GPU-accelerated AI services running on local hardware (NVIDIA RTX 5090), exposed securely via Cloudflare Tunnel with Zero Trust authentication.

| Service | Endpoint | Model | Use Case |
|---------|----------|-------|----------|
| **Embedder** | `https://embedder.affinityecho.com` | `intfloat/e5-mistral-7b-instruct` | Semantic embeddings for RAG, search, similarity |
| **Chat** | `https://chat.affinityecho.com` | `hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4` | Chat completions, reasoning, text generation |

---

## Authentication

All requests require Cloudflare Access service token headers.

### Environment Variables (.env)

```bash
# Cloudflare Access Service Token
CF_ACCESS_CLIENT_ID=c83bd82878c8a1937d64ba223324b615.access
CF_ACCESS_CLIENT_SECRET=d71737956553bccdb12403d5512b8b87a9244815fc9685bd5efe970f3138f9dd

# API Endpoints
VLLM_EMBEDDER_URL=https://embedder.affinityecho.com
VLLM_CHAT_URL=https://chat.affinityecho.com
```

---

# Embedder Service

The Embedder service converts text into dense vector representations (embeddings) that capture semantic meaning. These vectors enable similarity search, clustering, and retrieval-augmented generation (RAG).

## Embeddings API

**Endpoint:** `POST /v1/embeddings`

**Request:**
```json
{
  "model": "intfloat/e5-mistral-7b-instruct",
  "input": ["Your text to embed here"]
}
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.123, -0.456, ...]
    }
  ],
  "model": "intfloat/e5-mistral-7b-instruct",
  "usage": {
    "prompt_tokens": 2,
    "total_tokens": 2
  }
}
```

---

## Grounding for Embeddings (Instruction Prefixes)

The `e5-mistral-7b-instruct` model is instruction-tuned, meaning you can improve embedding quality by prefixing your text with task-specific instructions.

### Why Grounding Matters for Embeddings

Different tasks require different semantic representations:
- A **search query** should match relevant documents
- A **document** should be retrievable by related queries
- A **classification** task needs category-aligned vectors

### Instruction Prefix Format

Prefix your input text with `Instruct: {task}\nQuery: {text}` for optimal results.

### Common Grounding Instructions

| Task | Instruction Prefix |
|------|-------------------|
| **Semantic Search (Query)** | `Instruct: Given a web search query, retrieve relevant passages\nQuery: ` |
| **Semantic Search (Document)** | `Instruct: Represent this document for retrieval\nQuery: ` |
| **Similarity Matching** | `Instruct: Retrieve semantically similar text\nQuery: ` |
| **Classification** | `Instruct: Classify the following text\nQuery: ` |
| **Clustering** | `Instruct: Identify the topic of this text\nQuery: ` |
| **Q&A Retrieval** | `Instruct: Given a question, retrieve passages that answer the question\nQuery: ` |

### Example: Search Query vs Document

```python
# For the QUERY (what the user searches for)
query_input = "Instruct: Given a web search query, retrieve relevant passages\nQuery: How do I reset my password?"

# For the DOCUMENT (what gets indexed in your database)
doc_input = "Instruct: Represent this document for retrieval\nQuery: To reset your password, click on 'Forgot Password' on the login page..."
```

### cURL Example with Grounding

```bash
curl -X POST https://embedder.affinityecho.com/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}" \
  -d '{
    "model": "intfloat/e5-mistral-7b-instruct",
    "input": ["Instruct: Given a web search query, retrieve relevant passages\nQuery: What are the benefits of vector databases?"]
  }'
```

### Batch Embedding with Grounding

```bash
curl -X POST https://embedder.affinityecho.com/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}" \
  -d '{
    "model": "intfloat/e5-mistral-7b-instruct",
    "input": [
      "Instruct: Represent this document for retrieval\nQuery: Vector databases store embeddings for fast similarity search.",
      "Instruct: Represent this document for retrieval\nQuery: RAG combines retrieval with generation for accurate responses.",
      "Instruct: Represent this document for retrieval\nQuery: Semantic search finds results based on meaning, not keywords."
    ]
  }'
```

---

## Embedder Sample Code

### Python

```python
import os
import requests
from dotenv import load_dotenv

load_dotenv()

class EmbedderClient:
    def __init__(self):
        self.base_url = os.getenv("VLLM_EMBEDDER_URL")
        self.headers = {
            "Content-Type": "application/json",
            "CF-Access-Client-Id": os.getenv("CF_ACCESS_CLIENT_ID"),
            "CF-Access-Client-Secret": os.getenv("CF_ACCESS_CLIENT_SECRET"),
        }
        self.model = "intfloat/e5-mistral-7b-instruct"
    
    def _format_input(self, text: str, instruction: str = None) -> str:
        """Apply instruction prefix for grounding."""
        if instruction:
            return f"Instruct: {instruction}\nQuery: {text}"
        return text
    
    def embed_query(self, query: str) -> list[float]:
        """Embed a search query."""
        instruction = "Given a web search query, retrieve relevant passages"
        formatted = self._format_input(query, instruction)
        return self._get_embedding(formatted)
    
    def embed_document(self, document: str) -> list[float]:
        """Embed a document for indexing."""
        instruction = "Represent this document for retrieval"
        formatted = self._format_input(document, instruction)
        return self._get_embedding(formatted)
    
    def embed_for_similarity(self, text: str) -> list[float]:
        """Embed text for similarity matching."""
        instruction = "Retrieve semantically similar text"
        formatted = self._format_input(text, instruction)
        return self._get_embedding(formatted)
    
    def embed_batch(self, texts: list[str], instruction: str = None) -> list[list[float]]:
        """Embed multiple texts with optional instruction."""
        formatted = [self._format_input(t, instruction) for t in texts]
        response = requests.post(
            f"{self.base_url}/v1/embeddings",
            headers=self.headers,
            json={"model": self.model, "input": formatted}
        )
        response.raise_for_status()
        return [item["embedding"] for item in response.json()["data"]]
    
    def _get_embedding(self, text: str) -> list[float]:
        """Get embedding for a single text."""
        response = requests.post(
            f"{self.base_url}/v1/embeddings",
            headers=self.headers,
            json={"model": self.model, "input": [text]}
        )
        response.raise_for_status()
        return response.json()["data"][0]["embedding"]


# Usage Example
if __name__ == "__main__":
    client = EmbedderClient()
    
    # Embed a search query
    query_embedding = client.embed_query("How do I implement authentication?")
    print(f"Query embedding dimension: {len(query_embedding)}")
    
    # Embed documents for indexing
    documents = [
        "OAuth 2.0 is an authorization framework that enables secure access.",
        "JWT tokens are commonly used for stateless authentication.",
        "Session-based auth stores user state on the server side."
    ]
    doc_embeddings = client.embed_batch(
        documents, 
        instruction="Represent this document for retrieval"
    )
    print(f"Embedded {len(doc_embeddings)} documents")
    
    # Compute similarity (cosine)
    import numpy as np
    def cosine_similarity(a, b):
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
    
    for i, doc in enumerate(documents):
        sim = cosine_similarity(query_embedding, doc_embeddings[i])
        print(f"Similarity to doc {i+1}: {sim:.4f}")
```

### Python (OpenAI SDK)

```python
import os
import httpx
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

def create_embedder_client() -> OpenAI:
    """Create OpenAI client configured for Affinity Echo Embedder."""
    http_client = httpx.Client(
        headers={
            "CF-Access-Client-Id": os.getenv("CF_ACCESS_CLIENT_ID"),
            "CF-Access-Client-Secret": os.getenv("CF_ACCESS_CLIENT_SECRET"),
        }
    )
    return OpenAI(
        base_url=f"{os.getenv('VLLM_EMBEDDER_URL')}/v1",
        api_key="not-needed",
        http_client=http_client
    )

client = create_embedder_client()

# Embed with instruction grounding
def embed_with_instruction(texts: list[str], instruction: str) -> list[list[float]]:
    formatted = [f"Instruct: {instruction}\nQuery: {t}" for t in texts]
    response = client.embeddings.create(
        model="intfloat/e5-mistral-7b-instruct",
        input=formatted
    )
    return [item.embedding for item in response.data]

# Usage
query_embeddings = embed_with_instruction(
    ["What is machine learning?"],
    instruction="Given a web search query, retrieve relevant passages"
)

doc_embeddings = embed_with_instruction(
    ["Machine learning is a subset of AI that enables systems to learn from data."],
    instruction="Represent this document for retrieval"
)
```

### TypeScript/JavaScript

```typescript
import { config } from "dotenv";
config();

interface EmbeddingResponse {
  object: string;
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

class EmbedderClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private model = "intfloat/e5-mistral-7b-instruct";

  constructor() {
    this.baseUrl = process.env.VLLM_EMBEDDER_URL!;
    this.headers = {
      "Content-Type": "application/json",
      "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID!,
      "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET!,
    };
  }

  private formatInput(text: string, instruction?: string): string {
    if (instruction) {
      return `Instruct: ${instruction}\nQuery: ${text}`;
    }
    return text;
  }

  async embedQuery(query: string): Promise<number[]> {
    const instruction = "Given a web search query, retrieve relevant passages";
    return this.getEmbedding(this.formatInput(query, instruction));
  }

  async embedDocument(document: string): Promise<number[]> {
    const instruction = "Represent this document for retrieval";
    return this.getEmbedding(this.formatInput(document, instruction));
  }

  async embedBatch(texts: string[], instruction?: string): Promise<number[][]> {
    const formatted = texts.map((t) => this.formatInput(t, instruction));
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ model: this.model, input: formatted }),
    });
    const data: EmbeddingResponse = await response.json();
    return data.data.map((item) => item.embedding);
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ model: this.model, input: [text] }),
    });
    const data: EmbeddingResponse = await response.json();
    return data.data[0].embedding;
  }
}

// Usage
async function main() {
  const client = new EmbedderClient();

  // Embed a search query
  const queryEmbedding = await client.embedQuery("How do I reset my password?");
  console.log(`Query embedding dimension: ${queryEmbedding.length}`);

  // Embed documents
  const documents = [
    "Click 'Forgot Password' on the login page to reset your password.",
    "Contact support if you cannot access your account.",
  ];
  const docEmbeddings = await client.embedBatch(
    documents,
    "Represent this document for retrieval"
  );
  console.log(`Embedded ${docEmbeddings.length} documents`);
}

main();
```

---

# Chat Service

The Chat service provides text generation, reasoning, and conversational AI capabilities using the Llama 3.1 8B model.

## Chat Completions API

**Endpoint:** `POST /v1/chat/completions`

**Request:**
```json
{
  "model": "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "max_tokens": 512,
  "temperature": 0.7
}
```

**Response:**
```json
{
  "id": "cmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

---

## Grounding Instructions (System Prompts)

Grounding instructions guide the model's behavior, persona, and response style. Pass them via the `system` role in the messages array.

### Why Grounding Matters for Chat

System prompts control:
- **Persona**: Who the AI represents
- **Behavior**: How it responds (tone, length, format)
- **Constraints**: What it should/shouldn't do
- **Context**: Background information for accurate responses

### Basic Grounding

```json
{
  "model": "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful customer support agent for Affinity Echo. Be concise, friendly, and professional."
    },
    {
      "role": "user",
      "content": "How do I reset my password?"
    }
  ],
  "max_tokens": 256
}
```

### RAG Grounding (With Retrieved Context)

When using retrieval-augmented generation, inject retrieved documents into the system prompt:

```json
{
  "model": "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
  "messages": [
    {
      "role": "system",
      "content": "You are an AI assistant for Affinity Echo. Answer questions based ONLY on the provided context. If the answer is not in the context, say 'I don't have that information.'\n\n## Context\n\nTo reset your password:\n1. Click 'Forgot Password' on the login page\n2. Enter your email address\n3. Check your inbox for a reset link\n4. Create a new password"
    },
    {
      "role": "user",
      "content": "How do I reset my password?"
    }
  ],
  "max_tokens": 512
}
```

### Detailed Grounding Template

```json
{
  "model": "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
  "messages": [
    {
      "role": "system",
      "content": "## Role\nYou are a professional career advisor specializing in tech industry transitions.\n\n## Instructions\n- Provide actionable, specific advice\n- Ask clarifying questions when needed\n- Be encouraging but realistic\n- Keep responses under 200 words unless asked for more detail\n\n## Constraints\n- Do not provide legal or financial advice\n- Do not make guarantees about job outcomes\n- Always recommend consulting professionals for specific situations\n\n## User Context\nUser Profile: MBA student transitioning from HR to product management\nExperience: 7 years in HR, including 4 years at Dell Technologies"
    },
    {
      "role": "user",
      "content": "How should I position my HR background for PM roles?"
    }
  ],
  "max_tokens": 512,
  "temperature": 0.7
}
```

### Multi-Turn Conversation

The system message persists across the conversation. Include the full message history:

```json
{
  "model": "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
  "messages": [
    {
      "role": "system",
      "content": "You are a friendly coding tutor. Explain concepts simply with examples."
    },
    {
      "role": "user",
      "content": "What is a Python decorator?"
    },
    {
      "role": "assistant",
      "content": "A decorator is a function that wraps another function to extend its behavior without modifying it directly..."
    },
    {
      "role": "user",
      "content": "Can you show me an example?"
    }
  ],
  "max_tokens": 512
}
```

### Grounding Best Practices

| Practice | Example |
|----------|---------|
| **Be specific** | "Respond in 2-3 sentences" vs "Be concise" |
| **Define persona** | "You are a senior software engineer at a startup" |
| **Set constraints** | "Only answer questions about Python" |
| **Provide format** | "Respond in JSON format with keys: answer, confidence" |
| **Include context** | "The user is a beginner programmer" |
| **Handle unknowns** | "If unsure, say 'I don't know' rather than guessing" |

### cURL Example with Grounding

```bash
curl -X POST https://chat.affinityecho.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}" \
  -d '{
    "model": "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
    "messages": [
      {
        "role": "system",
        "content": "You are a concise technical assistant. Respond in bullet points. Maximum 3 bullets per response."
      },
      {
        "role": "user",
        "content": "What are the benefits of microservices?"
      }
    ],
    "max_tokens": 256
  }'
```

---

## Chat Sample Code

### Python

```python
import os
import requests
from dotenv import load_dotenv

load_dotenv()

class ChatClient:
    def __init__(self):
        self.base_url = os.getenv("VLLM_CHAT_URL")
        self.headers = {
            "Content-Type": "application/json",
            "CF-Access-Client-Id": os.getenv("CF_ACCESS_CLIENT_ID"),
            "CF-Access-Client-Secret": os.getenv("CF_ACCESS_CLIENT_SECRET"),
        }
        self.model = "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4"
    
    def chat(
        self,
        messages: list[dict],
        system_prompt: str = None,
        max_tokens: int = 512,
        temperature: float = 0.7
    ) -> str:
        """Send a chat completion request."""
        if system_prompt:
            messages = [{"role": "system", "content": system_prompt}] + messages
        
        response = requests.post(
            f"{self.base_url}/v1/chat/completions",
            headers=self.headers,
            json={
                "model": self.model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature
            }
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    
    def chat_with_context(
        self,
        question: str,
        context: str,
        system_template: str = None
    ) -> str:
        """RAG-style chat with retrieved context."""
        if system_template is None:
            system_template = """You are a helpful assistant. Answer the question based ONLY on the provided context. If the answer is not in the context, say "I don't have that information."

## Context
{context}"""
        
        system_prompt = system_template.format(context=context)
        messages = [{"role": "user", "content": question}]
        return self.chat(messages, system_prompt=system_prompt)


# Usage Example
if __name__ == "__main__":
    client = ChatClient()
    
    # Simple chat
    response = client.chat(
        messages=[{"role": "user", "content": "What is Python?"}],
        system_prompt="You are a concise technical assistant. Keep responses under 50 words."
    )
    print("Simple chat:", response)
    
    # RAG-style chat with context
    context = """
    Affinity Echo is an AI-powered professional networking platform.
    It connects underrepresented talent in tech with mentors and opportunities.
    The platform uses semantic matching to pair users with relevant connections.
    """
    
    response = client.chat_with_context(
        question="What does Affinity Echo do?",
        context=context
    )
    print("RAG chat:", response)
    
    # Multi-turn conversation
    conversation = [
        {"role": "user", "content": "I want to learn about APIs"},
        {"role": "assistant", "content": "APIs (Application Programming Interfaces) allow different software systems to communicate..."},
        {"role": "user", "content": "What's the difference between REST and GraphQL?"}
    ]
    response = client.chat(
        messages=conversation,
        system_prompt="You are a patient programming tutor. Use simple analogies."
    )
    print("Multi-turn:", response)
```

### Python (OpenAI SDK)

```python
import os
import httpx
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

def create_chat_client() -> OpenAI:
    """Create OpenAI client configured for Affinity Echo Chat."""
    http_client = httpx.Client(
        headers={
            "CF-Access-Client-Id": os.getenv("CF_ACCESS_CLIENT_ID"),
            "CF-Access-Client-Secret": os.getenv("CF_ACCESS_CLIENT_SECRET"),
        }
    )
    return OpenAI(
        base_url=f"{os.getenv('VLLM_CHAT_URL')}/v1",
        api_key="not-needed",
        http_client=http_client
    )

client = create_chat_client()

# Simple completion
completion = client.chat.completions.create(
    model="hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain RAG in one sentence."}
    ],
    max_tokens=256
)
print(completion.choices[0].message.content)

# With grounding for RAG
def chat_with_rag(question: str, retrieved_docs: list[str]) -> str:
    context = "\n\n".join(retrieved_docs)
    system_prompt = f"""Answer based ONLY on the provided context. If unsure, say "I don't know."

## Context
{context}"""
    
    completion = client.chat.completions.create(
        model="hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question}
        ],
        max_tokens=512
    )
    return completion.choices[0].message.content

# Usage
docs = [
    "The password reset link expires after 24 hours.",
    "Users can reset passwords via email or SMS verification."
]
answer = chat_with_rag("How long is the reset link valid?", docs)
print(answer)
```

### TypeScript/JavaScript

```typescript
import { config } from "dotenv";
config();

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class ChatClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private model = "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4";

  constructor() {
    this.baseUrl = process.env.VLLM_CHAT_URL!;
    this.headers = {
      "Content-Type": "application/json",
      "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID!,
      "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET!,
    };
  }

  async chat(
    messages: ChatMessage[],
    options: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<string> {
    const { systemPrompt, maxTokens = 512, temperature = 0.7 } = options;

    const allMessages = systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }, ...messages]
      : messages;

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    const data: ChatCompletionResponse = await response.json();
    return data.choices[0].message.content;
  }

  async chatWithContext(
    question: string,
    context: string,
    systemTemplate?: string
  ): Promise<string> {
    const template =
      systemTemplate ??
      `Answer based ONLY on the provided context. If unsure, say "I don't know."

## Context
{context}`;

    const systemPrompt = template.replace("{context}", context);
    return this.chat([{ role: "user", content: question }], { systemPrompt });
  }
}

// Usage
async function main() {
  const client = new ChatClient();

  // Simple chat with grounding
  const response = await client.chat(
    [{ role: "user", content: "What is TypeScript?" }],
    {
      systemPrompt:
        "You are a concise technical assistant. Keep responses under 50 words.",
    }
  );
  console.log("Simple chat:", response);

  // RAG-style with context
  const context = `
    Affinity Echo uses vector embeddings for semantic matching.
    The platform connects underrepresented professionals with mentors.
  `;
  const ragResponse = await client.chatWithContext(
    "How does Affinity Echo match users?",
    context
  );
  console.log("RAG chat:", ragResponse);
}

main();
```

---

# Full RAG Pipeline Example

Combining both Embedder and Chat services for retrieval-augmented generation.

### Python

```python
import os
import numpy as np
import requests
from dotenv import load_dotenv

load_dotenv()

class RAGPipeline:
    def __init__(self):
        self.headers = {
            "Content-Type": "application/json",
            "CF-Access-Client-Id": os.getenv("CF_ACCESS_CLIENT_ID"),
            "CF-Access-Client-Secret": os.getenv("CF_ACCESS_CLIENT_SECRET"),
        }
        self.embedder_url = os.getenv("VLLM_EMBEDDER_URL")
        self.chat_url = os.getenv("VLLM_CHAT_URL")
        self.embedder_model = "intfloat/e5-mistral-7b-instruct"
        self.chat_model = "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4"
        
        # In-memory document store (replace with vector DB in production)
        self.documents: list[str] = []
        self.embeddings: list[list[float]] = []
    
    def _embed(self, texts: list[str], instruction: str) -> list[list[float]]:
        """Get embeddings with instruction grounding."""
        formatted = [f"Instruct: {instruction}\nQuery: {t}" for t in texts]
        response = requests.post(
            f"{self.embedder_url}/v1/embeddings",
            headers=self.headers,
            json={"model": self.embedder_model, "input": formatted}
        )
        response.raise_for_status()
        return [item["embedding"] for item in response.json()["data"]]
    
    def index_documents(self, documents: list[str]):
        """Index documents for retrieval."""
        self.documents = documents
        self.embeddings = self._embed(
            documents, 
            instruction="Represent this document for retrieval"
        )
        print(f"Indexed {len(documents)} documents")
    
    def retrieve(self, query: str, top_k: int = 3) -> list[str]:
        """Retrieve most relevant documents for a query."""
        query_embedding = self._embed(
            [query], 
            instruction="Given a web search query, retrieve relevant passages"
        )[0]
        
        # Compute cosine similarities
        similarities = []
        for doc_embedding in self.embeddings:
            sim = np.dot(query_embedding, doc_embedding) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(doc_embedding)
            )
            similarities.append(sim)
        
        # Get top-k document indices
        top_indices = np.argsort(similarities)[-top_k:][::-1]
        return [self.documents[i] for i in top_indices]
    
    def generate(self, query: str, context: list[str]) -> str:
        """Generate answer using retrieved context."""
        context_text = "\n\n".join(context)
        system_prompt = f"""You are a helpful assistant. Answer the question based ONLY on the provided context. If the answer is not in the context, say "I don't have that information."

## Context
{context_text}"""
        
        response = requests.post(
            f"{self.chat_url}/v1/chat/completions",
            headers=self.headers,
            json={
                "model": self.chat_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ],
                "max_tokens": 512,
                "temperature": 0.7
            }
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    
    def query(self, question: str, top_k: int = 3) -> str:
        """Full RAG pipeline: retrieve then generate."""
        retrieved_docs = self.retrieve(question, top_k)
        return self.generate(question, retrieved_docs)


# Usage Example
if __name__ == "__main__":
    rag = RAGPipeline()
    
    # Index some documents
    documents = [
        "Affinity Echo is an AI-powered professional networking platform for underrepresented talent in tech.",
        "Users can connect with mentors who share similar backgrounds and career paths.",
        "The platform uses semantic matching to pair users with relevant opportunities and connections.",
        "Affinity Echo offers both free and premium tiers with advanced matching features.",
        "The company was founded to address the lack of diverse representation in tech networking.",
    ]
    rag.index_documents(documents)
    
    # Query the system
    question = "What is Affinity Echo and who is it for?"
    answer = rag.query(question)
    print(f"Q: {question}")
    print(f"A: {answer}")
```

### TypeScript

```typescript
import { config } from "dotenv";
config();

class RAGPipeline {
  private headers: Record<string, string>;
  private embedderUrl: string;
  private chatUrl: string;
  private documents: string[] = [];
  private embeddings: number[][] = [];

  constructor() {
    this.embedderUrl = process.env.VLLM_EMBEDDER_URL!;
    this.chatUrl = process.env.VLLM_CHAT_URL!;
    this.headers = {
      "Content-Type": "application/json",
      "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID!,
      "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET!,
    };
  }

  private async embed(texts: string[], instruction: string): Promise<number[][]> {
    const formatted = texts.map((t) => `Instruct: ${instruction}\nQuery: ${t}`);
    const response = await fetch(`${this.embedderUrl}/v1/embeddings`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        model: "intfloat/e5-mistral-7b-instruct",
        input: formatted,
      }),
    });
    const data = await response.json();
    return data.data.map((item: any) => item.embedding);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dot / (normA * normB);
  }

  async indexDocuments(documents: string[]): Promise<void> {
    this.documents = documents;
    this.embeddings = await this.embed(
      documents,
      "Represent this document for retrieval"
    );
    console.log(`Indexed ${documents.length} documents`);
  }

  async retrieve(query: string, topK = 3): Promise<string[]> {
    const [queryEmbedding] = await this.embed(
      [query],
      "Given a web search query, retrieve relevant passages"
    );

    const similarities = this.embeddings.map((docEmb) =>
      this.cosineSimilarity(queryEmbedding, docEmb)
    );

    const topIndices = similarities
      .map((sim, idx) => ({ sim, idx }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, topK)
      .map((item) => item.idx);

    return topIndices.map((i) => this.documents[i]);
  }

  async generate(query: string, context: string[]): Promise<string> {
    const contextText = context.join("\n\n");
    const systemPrompt = `Answer based ONLY on the provided context. If unsure, say "I don't know."

## Context
${contextText}`;

    const response = await fetch(`${this.chatUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        model: "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        max_tokens: 512,
      }),
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async query(question: string, topK = 3): Promise<string> {
    const retrievedDocs = await this.retrieve(question, topK);
    return this.generate(question, retrievedDocs);
  }
}

// Usage
async function main() {
  const rag = new RAGPipeline();

  await rag.indexDocuments([
    "Affinity Echo is an AI-powered professional networking platform.",
    "Users connect with mentors who share similar backgrounds.",
    "The platform uses semantic matching for relevant connections.",
  ]);

  const answer = await rag.query("What does Affinity Echo do?");
  console.log("Answer:", answer);
}

main();
```

---

# Infrastructure & Troubleshooting

## Infrastructure Details

| Component | Details |
|-----------|---------|
| **Hardware** | NVIDIA RTX 5090, 32GB DDR5 |
| **Host OS** | Windows + WSL (Ubuntu) |
| **Runtime** | vLLM with Docker |
| **Networking** | Cloudflare Tunnel (Zero Trust) |
| **Embedder Port** | localhost:8001 |
| **Chat Port** | localhost:8000 |

### Tunnel Configuration

| Tunnel | ID | Config File |
|--------|-----|-------------|
| **vllm-embedder** | `04a8edb6-f89c-486a-87ac-3b080993bfe1` | `~/.cloudflared/config.yml` |
| **vllm-chat** | `48627a39-a17e-4ee0-b638-073f45b91314` | `~/.cloudflared/config-chat.yml` |

## Troubleshooting

### Check if services are running locally
```bash
curl http://localhost:8001/v1/models  # Embedder
curl http://localhost:8000/v1/models  # Chat
```

### Check tunnel status
```bash
cloudflared tunnel list
```

### Start tunnels manually
```bash
# Embedder
nohup cloudflared tunnel run vllm-embedder > /tmp/cloudflared-embedder.log 2>&1 &

# Chat
nohup cloudflared tunnel --config ~/.cloudflared/config-chat.yml run vllm-chat > /tmp/cloudflared-chat.log 2>&1 &
```

### Fix DNS resolution (if needed)
```bash
echo -e "nameserver 1.1.1.1\nnameserver 8.8.8.8" | sudo tee /etc/resolv.conf
```

### Test endpoints with authentication
```bash
# Embedder
curl -s https://embedder.affinityecho.com/v1/models \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"

# Chat
curl -s https://chat.affinityecho.com/v1/models \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"
```

---

## Security Notes

- All traffic is encrypted via Cloudflare
- Service token required for all requests
- No public access without authentication
- Tokens should be stored securely (never commit to git)
- Add `.env` to your `.gitignore`

---

*Last updated: January 25, 2026*
