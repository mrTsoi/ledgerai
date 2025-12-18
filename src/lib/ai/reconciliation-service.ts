import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database.types'
import OpenAI from 'openai'

type BankTransaction = Database['public']['Tables']['bank_transactions']['Row']
type Transaction = Database['public']['Tables']['transactions']['Row']

export interface ReconciliationMatch {
  transaction: Transaction
  confidence_score: number
  reasoning: string
}

export class AIReconciliationService {
  
  static async findMatches(
    bankTransaction: BankTransaction, 
    candidates: Transaction[],
    tenantId: string
  ): Promise<ReconciliationMatch[]> {
    try {
      const supabase = await createClient()
      
      // Get AI Config
      const { data: aiConfig } = await supabase
        .from('tenant_ai_configurations')
        .select('*, ai_providers(*)')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .maybeSingle()

      // If no AI config or no candidates, return empty or simple rule-based matches
      if (!aiConfig || candidates.length === 0) {
        return this.ruleBasedMatching(bankTransaction, candidates)
      }

      // Prepare prompt for AI
      const prompt = `
        You are an expert accountant performing bank reconciliation.
        
        Bank Transaction:
        Date: ${bankTransaction.transaction_date}
        Description: ${bankTransaction.description}
        Amount: ${bankTransaction.amount}
        Type: ${bankTransaction.transaction_type}
        
        Candidate Ledger Transactions:
        ${JSON.stringify(candidates.map((c: any) => ({
          id: c.id,
          date: c.transaction_date,
          description: c.description,
          amount: c.amount !== undefined ? c.amount : "Unknown (check line items)",
          reference: c.reference_number
        })), null, 2)}
        
        Task:
        Compare the bank transaction with the candidates. 
        Return a JSON array of matches. Each match should have:
        - "transaction_id": The ID of the matching ledger transaction
        - "confidence_score": A number between 0 and 1 (1 being perfect match)
        - "reasoning": A short explanation of why it matches (e.g. "Exact amount and date match", "Description similarity")
        
        Rules:
        - Dates should be close (within a few days).
        - Amounts should match exactly or be very close (if fees involved).
        - Descriptions might be different but refer to the same entity.
        
        Return ONLY valid JSON.
      `

      // Call AI (Mocking the call structure based on document-processor)
      // In production, you'd decrypt the key and call OpenAI/Anthropic
      // For now, we'll fallback to rule-based if no API key or just simulate
      
      // SIMULATION for now as we don't want to break if no keys
      return this.ruleBasedMatching(bankTransaction, candidates)

    } catch (error) {
      console.error('AI Reconciliation Error:', error)
      return []
    }
  }

  private static ruleBasedMatching(
    bankTransaction: BankTransaction, 
    candidates: Transaction[]
  ): ReconciliationMatch[] {
    return candidates.map(candidate => {
      let score = 0
      const reasons = []

      // Date check
      const bankDate = new Date(bankTransaction.transaction_date)
      const ledgerDate = new Date(candidate.transaction_date)
      const diffTime = Math.abs(bankDate.getTime() - ledgerDate.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        score += 0.4
        reasons.push('Exact date match')
      } else if (diffDays <= 3) {
        score += 0.3
        reasons.push('Date within 3 days')
      } else if (diffDays <= 7) {
        score += 0.1
        reasons.push('Date within 7 days')
      }

      // Description check (simple fuzzy)
      const bankDesc = (bankTransaction.description || '').toLowerCase()
      const ledgerDesc = (candidate.description || '').toLowerCase()
      
      if (bankDesc === ledgerDesc) {
        score += 0.4
        reasons.push('Exact description match')
      } else if (bankDesc.includes(ledgerDesc) || ledgerDesc.includes(bankDesc)) {
        score += 0.3
        reasons.push('Partial description match')
      }

      // Amount check
      const candidateAmount = (candidate as unknown as Record<string, unknown>)['amount']
      if (typeof candidateAmount === 'number') {
        const amountDiff = Math.abs(bankTransaction.amount - candidateAmount)
        if (amountDiff < 0.05) {
          score += 0.4
          reasons.push('Exact amount match')
        } else if (amountDiff < 1.0) {
          score += 0.2
          reasons.push('Close amount match')
        }
      } else {
        score += 0.2 // Fallback if amount unknown but passed in list
      }

      return {
        transaction: candidate,
        confidence_score: Math.min(score, 1),
        reasoning: reasons.join(', ') || 'Potential match'
      }
    }).sort((a, b) => b.confidence_score - a.confidence_score)
  }
}
