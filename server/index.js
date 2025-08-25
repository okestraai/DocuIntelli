const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
const ensureUploadsDir = async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    console.log(`📁 Uploads directory ready: ${uploadsDir}`);
  } catch (error) {
    console.error('Failed to create uploads directory:', error);
  }
};

ensureUploadsDir();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueId}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// In-memory database (replace with real database in production)
let documents = [];

// Helper function to get file type from mimetype
const getFileType = (mimetype) => {
  if (mimetype.includes('pdf')) return 'PDF';
  if (mimetype.includes('word')) return 'Word';
  if (mimetype.includes('text')) return 'Text';
  if (mimetype.includes('image')) return 'Image';
  return 'Document';
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Routes
app.post('/api/documents/upload', upload.array('files'), async (req, res) => {
  try {
    const { names, categories } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const namesArray = Array.isArray(names) ? names : [names];
    const categoriesArray = Array.isArray(categories) ? categories : [categories];

    const uploadedDocuments = files.map((file, index) => {
      const document = {
        id: uuidv4(),
        name: namesArray[index] || file.originalname,
        category: categoriesArray[index] || 'other',
        type: getFileType(file.mimetype),
        size: formatFileSize(file.size),
        filePath: file.path,
        originalName: file.originalname,
        uploadDate: new Date().toISOString().split('T')[0],
        status: 'active',
        createdAt: new Date().toISOString()
      };

      documents.push(document);
      return document;
    });

    console.log(`Uploaded ${uploadedDocuments.length} documents to object storage`);
    
    res.json(uploadedDocuments);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload documents' });
  }
});

app.get('/api/documents', (req, res) => {
  try {
    res.json(documents);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to retrieve documents' });
  }
});

app.delete('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const documentIndex = documents.findIndex(doc => doc.id === id);
    
    if (documentIndex === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documents[documentIndex];
    
    // Delete file from storage
    try {
      await fs.unlink(document.filePath);
    } catch (fileError) {
      console.warn('Failed to delete file:', fileError);
    }

    // Remove from database
    documents.splice(documentIndex, 1);
    
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

app.get('/api/documents/:id/download', (req, res) => {
  try {
    const { id } = req.params;
    const document = documents.find(doc => doc.id === id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.download(document.filePath, document.originalName);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// New route for viewing documents (returns file content for viewer)
app.get('/api/documents/:id/view', (req, res) => {
  try {
    const { id } = req.params;
    const document = documents.find(doc => doc.id === id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Set appropriate content type based on file extension
    const ext = path.extname(document.originalName).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (['.jpg', '.jpeg'].includes(ext)) {
      contentType = 'image/jpeg';
    } else if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.gif') {
      contentType = 'image/gif';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(path.resolve(document.filePath));
  } catch (error) {
    console.error('View error:', error);
    res.status(500).json({ error: 'Failed to view document' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Document storage directory: ${uploadsDir}`);
});