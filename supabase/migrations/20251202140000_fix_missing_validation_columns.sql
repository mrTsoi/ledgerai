-- Fix missing validation columns in documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS validation_flags JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Create index for content hash if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);
