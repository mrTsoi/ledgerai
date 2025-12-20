import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check admin permission
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('Unauthorized', { status: 401 })

    const { data: isSuperAdmin, error } = await (supabase as any).rpc('is_super_admin')
    if (error || isSuperAdmin !== true) return new NextResponse('Forbidden', { status: 403 })

    const stripe = await getStripe()

    // Fetch all active promo codes from DB
    const { data: codes } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('is_active', true)

    if (!codes) return new NextResponse('No codes found', { status: 404 })

    const results = []

    for (const code of (codes as any[])) {
      try {
        // Check if coupon exists
        try {
          await stripe.coupons.retrieve(code.code)
          results.push({ code: code.code, status: 'exists' })
        } catch (e) {
          // Create coupon
          await stripe.coupons.create({
            id: code.code,
            name: code.description || code.code,
            percent_off: code.discount_type === 'PERCENTAGE' ? code.discount_value : undefined,
            amount_off: code.discount_type === 'FIXED_AMOUNT' ? Math.round(code.discount_value * 100) : undefined,
            currency: code.discount_type === 'FIXED_AMOUNT' ? 'usd' : undefined,
            duration: 'forever',
            max_redemptions: code.max_uses || undefined,
            redeem_by: code.valid_until ? Math.floor(new Date(code.valid_until).getTime() / 1000) : undefined,
          })
          
          // Create promotion code (required for customer-facing codes)
          await stripe.promotionCodes.create({
            coupon: code.code,
            code: code.code,
          } as any)
          
          results.push({ code: code.code, status: 'created' })
        }
      } catch (err: any) {
        console.error(`Error syncing code ${code.code}:`, err)
        results.push({ code: code.code, status: 'error', error: err.message })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    console.error('Sync error:', error)
    return new NextResponse(error.message, { status: 500 })
  }
}
