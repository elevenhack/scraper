require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { chromium } = require('playwright');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

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
    
    const pdfPath = path.join(__dirname, 'uploads', `temp-${Date.now()}.pdf`);
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
    // Read the file
    const fileBuffer = await fs.readFile(filePath);
    const base64File = fileBuffer.toString('base64');
    
    // Create a chat completion with file context
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract a price list from this document in Markdown format'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64File}`
              }
            }
          ]
        }
      ],
      max_tokens: 4096
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    throw new Error(`ChatGPT extraction failed: ${error.message}`);
  }
}

// API endpoint for URL processing
app.post('/api/extract-url', authenticate, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Download PDF from URL
    const pdfPath = await downloadPdfFromUrl(url);
    
    // Extract price list using ChatGPT
    const priceList = await extractPriceList(pdfPath);
    
    // Clean up the temporary file
    await fs.unlink(pdfPath);
    
    res.json({ 
      success: true, 
      priceList 
    });
  } catch (error) {
    console.error('Error processing URL:', error);
    res.status(500).json({ 
      error: 'Failed to process URL', 
      message: error.message 
    });
  }
});

// API endpoint for file upload
app.post('/api/extract-file', authenticate, upload.single('file'), async (req, res) => {
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
      error: 'Failed to process file', 
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(__dirname, 'uploads');
  fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);
});
