-- Add validation fields to documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS content_hash TEXT,
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING', 'VALID', 'INVALID', 'NEEDS_REVIEW')),
ADD COLUMN IF NOT EXISTS validation_flags JSONB DEFAULT '[]';

-- Create index for content hash to speed up duplicate checks
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);
