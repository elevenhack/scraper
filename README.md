# scraper

A basic Express application that uses Playwright and ChatGPT to extract price lists from documents.

## Features

- **URL Processing**: Download a PDF from any URL using Playwright
- **File Upload**: Upload PDF files directly
- **AI Extraction**: Uses ChatGPT to extract price lists in Markdown format
- **Secure**: Bearer token authentication for API access

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```

4. Create a `.env` file from the example:
```bash
cp .env.example .env
```

5. Configure your environment variables in `.env`:
   - `BEARER_TOKEN`: Your secret bearer token for API authentication
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `PORT`: Server port (optional, defaults to 3000)

## Usage

### Start the server

```bash
npm start
```

### API Endpoints

#### 1. Extract from URL

**Endpoint**: `POST /api/extract-url`

**Headers**:
```
Authorization: Bearer YOUR_BEARER_TOKEN
Content-Type: application/json
```

**Body**:
```json
{
  "url": "https://example.com/page-to-convert"
}
```

**Example with curl**:
```bash
curl -X POST http://localhost:3000/api/extract-url \
  -H "Authorization: Bearer YOUR_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/page-to-convert"}'
```

#### 2. Extract from File Upload

**Endpoint**: `POST /api/extract-file`

**Headers**:
```
Authorization: Bearer YOUR_BEARER_TOKEN
```

**Body**: multipart/form-data with a file field named `file`

**Example with curl**:
```bash
curl -X POST http://localhost:3000/api/extract-file \
  -H "Authorization: Bearer YOUR_BEARER_TOKEN" \
  -F "file=@/path/to/your/document.pdf"
```

#### 3. Health Check

**Endpoint**: `GET /health`

**Example**:
```bash
curl http://localhost:3000/health
```

### Response Format

Successful requests return:
```json
{
  "success": true,
  "priceList": "# Price List\n\n- Item 1: $10.00\n- Item 2: $20.00\n..."
}
```

Error responses return:
```json
{
  "error": "Error description",
  "message": "Detailed error message"
}
```

## Security

- All API endpoints (except `/health`) require Bearer token authentication
- File uploads are limited to 50MB
- Temporary files are automatically cleaned up after processing

## License

ISC
