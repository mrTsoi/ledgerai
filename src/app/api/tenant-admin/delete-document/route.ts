import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json();
    if (!documentId) {
      console.error('Missing documentId in request body');
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }
    const supabase = await createClient();
    // 1. Delete line_items for document's transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id')
      .eq('document_id', documentId);
    if (txError) {
      console.error('Error fetching transactions:', txError);
      throw txError;
    }
    if (transactions && transactions.length > 0) {
      const transactionIds = transactions.map((tx: any) => tx.id);
      const bankAccountIds = transactions.map((tx: any) => tx.bank_account_id).filter(Boolean);
      // Delete line_items
      const { error: liError } = await supabase.from('line_items').delete().in('transaction_id', transactionIds);
      if (liError) {
        console.error('Error deleting line_items:', liError);
        throw liError;
      }
      // Delete transactions
      const { error: tError } = await supabase.from('transactions').delete().in('id', transactionIds);
      if (tError) {
        console.error('Error deleting transactions:', tError);
        throw tError;
      }
      // Delete associated bank accounts
      if (bankAccountIds.length > 0) {
        const { error: baError } = await supabase.from('bank_accounts').delete().in('id', bankAccountIds);
        if (baError) {
          console.error('Error deleting bank_accounts:', baError);
          throw baError;
        }
      }
    }
    // 2. Delete the document
    const { error } = await supabase.from('documents').delete().eq('id', documentId);
    if (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete document and associated data' }, { status: 500 });
  }
}
