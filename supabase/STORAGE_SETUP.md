# Supabase Storage Setup for Documents

## Step 1: Create Storage Bucket

1. Go to your Supabase Dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"**
4. Enter the following details:
   - **Name**: `documents`
   - **Public bucket**: Leave unchecked (private)
   - **File size limit**: 50 MB (or adjust as needed)
   - **Allowed MIME types**: Leave empty for all types
5. Click **"Create bucket"**

## Step 2: Set Up Storage Policies

Go to **Storage** > **Policies** > **documents** bucket and create the following policies:

### Policy 1: Allow users to upload documents to their tenant folder

```sql
CREATE POLICY "Users can upload to their tenant folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM memberships 
    WHERE user_id = auth.uid() 
    AND is_active = true
  )
);
```

### Policy 2: Allow users to read documents from their tenant folder

```sql
CREATE POLICY "Users can read their tenant documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM memberships 
    WHERE user_id = auth.uid() 
    AND is_active = true
  )
);
```

### Policy 3: Allow users to update documents in their tenant folder

```sql
CREATE POLICY "Users can update their tenant documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM memberships 
    WHERE user_id = auth.uid() 
    AND is_active = true
  )
);
```

### Policy 4: Allow admins to delete documents from their tenant folder

```sql
CREATE POLICY "Admins can delete their tenant documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM memberships 
    WHERE user_id = auth.uid() 
    AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    AND is_active = true
  )
);
```

## File Path Structure

Documents are stored with the following path structure:
```
documents/
  └── {tenant_id}/
      └── {document_id}.{extension}
```

Example:
```
documents/123e4567-e89b-12d3-a456-426614174000/9876dcba-f012-3456-7890-abcdef123456.pdf
```

This ensures:
- Each tenant's files are isolated
- Files can be uniquely identified
- RLS policies can enforce access control

## Verification

After setting up:
1. Test file upload from the Documents page
2. Verify files appear in Storage > documents bucket
3. Ensure users can only see their tenant's files
4. Test download functionality

## Troubleshooting

**Issue**: "Permission denied" when uploading
- Check that RLS policies are created correctly
- Verify user has an active membership in the tenant
- Check that the file path starts with the correct tenant_id

**Issue**: Files not appearing after upload
- Check the documents table for the record
- Verify file_path matches the actual storage path
- Check browser console for errors

**Issue**: Cannot download files
- Ensure the SELECT policy is active
- Check that the signed URL is being generated correctly
- Verify file still exists in storage
