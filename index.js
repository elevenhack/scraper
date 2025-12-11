require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { chromium } = require('playwright');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const pdf = require('pdf-parse');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware to parse JSON
app.use(express.json());

// Rate limiter for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// URL validation to prevent SSRF attacks
function isValidUrl(url) {
  try {
    const parsedUrl = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }
    // Prevent access to internal/private networks
    const hostname = parsedUrl.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Bearer token authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.substring(7);
  
  if (token !== process.env.BEARER_TOKEN) {
    return res.status(403).json({ error: 'Invalid bearer token' });
  }
  
  next();
};

// Function to download PDF from URL using Playwright
async function downloadPdfFromUrl(url) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    
    const pdfPath = path.join(__dirname, 'uploads', `temp-${crypto.randomUUID()}.pdf`);
    await page.pdf({ path: pdfPath, format: 'A4' });
    
    await browser.close();
    return pdfPath;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Function to extract price list using ChatGPT
async function extractPriceList(filePath) {
  try {
    // Read the PDF file
    const dataBuffer = await fs.readFile(filePath);
    
    // Extract text from PDF
    const pdfData = await pdf(dataBuffer);
    const pdfText = pdfData.text;
    
    // Use ChatGPT to extract price list from text
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts price lists from documents.'
        },
        {
          role: 'user',
          content: `Extract a price list from this document in Markdown format:\n\n${pdfText}`
        }
      ],
      max_tokens: 4096
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    throw new Error(`Failed to extract price list: ${error.message}`);
  }
}

// API endpoint for URL processing
app.post('/api/extract-url', apiLimiter, authenticate, async (req, res) => {
  let pdfPath = null;
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Validate URL to prevent SSRF attacks
    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL or URL not allowed' });
    }
    
    // Download PDF from URL
    pdfPath = await downloadPdfFromUrl(url);
    
    // Extract price list using ChatGPT
    const priceList = await extractPriceList(pdfPath);
    
    // Clean up the temporary file
    await fs.unlink(pdfPath);
    pdfPath = null;
    
    res.json({ 
      success: true, 
      priceList 
    });
  } catch (error) {
    console.error('Error processing URL:', error);
    
    // Clean up the temporary file if it exists
    if (pdfPath) {
      try {
        await fs.unlink(pdfPath);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to process URL'
    });
  }
});

// API endpoint for file upload
app.post('/api/extract-file', apiLimiter, authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    // Extract price list using ChatGPT
    const priceList = await extractPriceList(req.file.path);
    
    // Clean up the uploaded file
    await fs.unlink(req.file.path);
    
    res.json({ 
      success: true, 
      priceList 
    });
  } catch (error) {
    console.error('Error processing file:', error);
    
    // Clean up the file if it exists
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to process file'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Create uploads directory before starting server
const uploadsDir = path.join(__dirname, 'uploads');
try {
  const fsSync = require('fs');
  fsSync.mkdirSync(uploadsDir, { recursive: true });
} catch (error) {
  if (error.code !== 'EEXIST') {
    console.error('Failed to create uploads directory:', error);
    process.exit(1);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
