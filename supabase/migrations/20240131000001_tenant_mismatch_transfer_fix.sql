-- ============================================================================
-- Fix/Enhance transfer_document_tenant to move tenant-scoped dependent rows
-- ============================================================================

-- Update platform default to enable auto actions by default (tenant can override)
UPDATE system_settings
SET setting_value = '{"allow_auto_tenant_creation": false, "allow_auto_reassignment": true, "min_confidence": 0.90}',
    updated_at = NOW()
WHERE setting_key = 'tenant_mismatch_policy';

CREATE OR REPLACE FUNCTION transfer_document_tenant(
  p_document_id UUID,
  p_target_tenant_id UUID,
  p_mode TEXT DEFAULT 'MOVE' -- 'MOVE' or 'DUPLICATE'
)
RETURNS UUID AS $$
DECLARE
  v_source_doc RECORD;
  v_new_doc_id UUID;
  v_shared_group_id UUID;
  v_stmt_ids UUID[];
BEGIN
  SELECT * INTO v_source_doc FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF p_mode = 'MOVE' THEN
    -- 1) Move document
    UPDATE documents
    SET tenant_id = p_target_tenant_id,
        updated_at = NOW()
    WHERE id = p_document_id;

    -- 2) Move transactions linked to this document
    UPDATE transactions
    SET tenant_id = p_target_tenant_id,
        updated_at = NOW()
    WHERE document_id = p_document_id;

    -- 3) Move bank statements linked to this document.
    -- NOTE: bank_account_id is tenant-scoped, so clear it to avoid cross-tenant reference.
    UPDATE bank_statements
    SET tenant_id = p_target_tenant_id,
        bank_account_id = NULL,
        updated_at = NOW()
    WHERE document_id = p_document_id;

    SELECT COALESCE(array_agg(id), '{}') INTO v_stmt_ids
    FROM bank_statements
    WHERE document_id = p_document_id;

    -- 4) Move bank transactions linked to those statements
    UPDATE bank_transactions
    SET tenant_id = p_target_tenant_id,
        updated_at = NOW()
    WHERE bank_statement_id = ANY(v_stmt_ids);

    RETURN p_document_id;

  ELSIF p_mode = 'DUPLICATE' THEN
    v_shared_group_id := COALESCE(v_source_doc.shared_group_id, gen_random_uuid());

    IF v_source_doc.shared_group_id IS NULL THEN
      UPDATE documents SET shared_group_id = v_shared_group_id WHERE id = p_document_id;
    END IF;

    INSERT INTO documents (
      tenant_id, file_path, file_name, file_size, file_type,
      status, document_type, uploaded_by, shared_group_id
    )
    VALUES (
      p_target_tenant_id, v_source_doc.file_path, v_source_doc.file_name,
      v_source_doc.file_size, v_source_doc.file_type,
      v_source_doc.status, v_source_doc.document_type,
      v_source_doc.uploaded_by, v_shared_group_id
    )
    RETURNING id INTO v_new_doc_id;

    -- Duplicate document_data if exists
    INSERT INTO document_data (
      document_id, extracted_data, confidence_score, vendor_name,
      document_date, total_amount, currency, line_items, metadata
    )
    SELECT
      v_new_doc_id, extracted_data, confidence_score, vendor_name,
      document_date, total_amount, currency, line_items, metadata
    FROM document_data WHERE document_id = p_document_id;

    RETURN v_new_doc_id;

  ELSE
    RAISE EXCEPTION 'Invalid mode: %', p_mode;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
