import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'

// Define types locally to avoid circular dependencies or complex imports
// These match the interfaces in the components
interface PLRow {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  account_subtype: string
  amount: number
}

interface BSRow {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  account_subtype: string
  amount: number
}

interface TrialBalanceRow {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  account_subtype: string
  debit_amount: number
  credit_amount: number
  balance: number
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

const addHeader = (doc: jsPDF, title: string, subtitle: string, tenantName: string) => {
  const pageWidth = doc.internal.pageSize.width
  
  doc.setFontSize(18)
  doc.text(tenantName, pageWidth / 2, 15, { align: 'center' })
  
  doc.setFontSize(14)
  doc.text(title, pageWidth / 2, 22, { align: 'center' })
  
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(subtitle, pageWidth / 2, 28, { align: 'center' })
  
  doc.setTextColor(0)
}

const addFooter = (doc: jsPDF) => {
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Generated on ${format(new Date(), 'MMM dd, yyyy HH:mm')} | Page ${i} of ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    )
  }
}

export const generateProfitLossPDF = (
  data: PLRow[], 
  startDate: string, 
  endDate: string, 
  tenantName: string = 'LedgerAI'
) => {
  const doc = new jsPDF()
  
  const revenues = data.filter(row => row.account_type === 'REVENUE')
  const expenses = data.filter(row => row.account_type === 'EXPENSE')
  
  const totalRevenue = revenues.reduce((sum, row) => sum + row.amount, 0)
  const totalExpense = expenses.reduce((sum, row) => sum + row.amount, 0)
  const netIncome = totalRevenue - totalExpense

  addHeader(
    doc, 
    'Profit & Loss Statement', 
    `Period: ${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')}`,
    tenantName
  )

  let finalY = 35

  // Revenue Section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 100, 0)
  doc.text('REVENUE', 14, finalY)
  
  autoTable(doc, {
    startY: finalY + 2,
    head: [['Code', 'Account Name', 'Amount']],
    body: [
      ...revenues.map(row => [row.account_code, row.account_name, formatCurrency(row.amount)]),
      ['', { content: 'Total Revenue', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalRevenue), styles: { fontStyle: 'bold' } }]
    ],
    theme: 'striped',
    headStyles: { fillColor: [220, 252, 231], textColor: [22, 101, 52] }, // green-100, green-800
    columnStyles: {
      0: { cellWidth: 30 },
      2: { halign: 'right' }
    }
  })

  finalY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? finalY) + 10

  // Expenses Section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(150, 0, 0)
  doc.text('EXPENSES', 14, finalY)

  autoTable(doc, {
    startY: finalY + 2,
    head: [['Code', 'Account Name', 'Amount']],
    body: [
      ...expenses.map(row => [row.account_code, row.account_name, formatCurrency(row.amount)]),
      ['', { content: 'Total Expenses', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalExpense), styles: { fontStyle: 'bold' } }]
    ],
    theme: 'striped',
    headStyles: { fillColor: [254, 226, 226], textColor: [153, 27, 27] }, // red-100, red-800
    columnStyles: {
      0: { cellWidth: 30 },
      2: { halign: 'right' }
    }
  })

  finalY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? finalY) + 10

  // Net Income Summary
  doc.setFillColor(netIncome >= 0 ? 220 : 254, netIncome >= 0 ? 252 : 226, netIncome >= 0 ? 231 : 226)
  doc.rect(14, finalY, 182, 20, 'F')
  
  doc.setFontSize(14)
  doc.setTextColor(0)
  doc.text('NET INCOME', 20, finalY + 13)
  
  doc.setFontSize(16)
  doc.setTextColor(netIncome >= 0 ? 22 : 153, netIncome >= 0 ? 101 : 27, netIncome >= 0 ? 52 : 27)
  doc.text(formatCurrency(netIncome), 190, finalY + 13, { align: 'right' })

  addFooter(doc)
  doc.save(`profit-loss-${startDate}-${endDate}.pdf`)
}

export const generateBalanceSheetPDF = (
  data: BSRow[], 
  asOfDate: string, 
  tenantName: string = 'LedgerAI'
) => {
  const doc = new jsPDF()
  
  const assets = data.filter(row => row.account_type === 'ASSET')
  const liabilities = data.filter(row => row.account_type === 'LIABILITY')
  const equity = data.filter(row => row.account_type === 'EQUITY')
  
  const totalAssets = assets.reduce((sum, row) => sum + row.amount, 0)
  const totalLiabilities = liabilities.reduce((sum, row) => sum + row.amount, 0)
  const totalEquity = equity.reduce((sum, row) => sum + row.amount, 0)

  addHeader(
    doc, 
    'Balance Sheet', 
    `As of: ${format(new Date(asOfDate), 'MMM dd, yyyy')}`,
    tenantName
  )

  let finalY = 35

  // Assets Section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 150)
  doc.text('ASSETS', 14, finalY)
  
  autoTable(doc, {
    startY: finalY + 2,
    head: [['Code', 'Account Name', 'Amount']],
    body: [
      ...assets.map(row => [row.account_code, row.account_name, formatCurrency(row.amount)]),
      ['', { content: 'Total Assets', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalAssets), styles: { fontStyle: 'bold' } }]
    ],
    theme: 'striped',
    headStyles: { fillColor: [219, 234, 254], textColor: [30, 58, 138] }, // blue-100, blue-900
    columnStyles: {
      0: { cellWidth: 30 },
      2: { halign: 'right' }
    }
  })

  finalY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? finalY) + 10

  // Liabilities Section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(150, 0, 0)
  doc.text('LIABILITIES', 14, finalY)

  autoTable(doc, {
    startY: finalY + 2,
    head: [['Code', 'Account Name', 'Amount']],
    body: [
      ...liabilities.map(row => [row.account_code, row.account_name, formatCurrency(row.amount)]),
      ['', { content: 'Total Liabilities', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalLiabilities), styles: { fontStyle: 'bold' } }]
    ],
    theme: 'striped',
    headStyles: { fillColor: [254, 226, 226], textColor: [153, 27, 27] }, // red-100, red-800
    columnStyles: {
      0: { cellWidth: 30 },
      2: { halign: 'right' }
    }
  })

  finalY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? finalY) + 10

  // Equity Section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 0, 100)
  doc.text('EQUITY', 14, finalY)

  autoTable(doc, {
    startY: finalY + 2,
    head: [['Code', 'Account Name', 'Amount']],
    body: [
      ...equity.map(row => [row.account_code, row.account_name, formatCurrency(row.amount)]),
      ['', { content: 'Total Equity', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalEquity), styles: { fontStyle: 'bold' } }]
    ],
    theme: 'striped',
    headStyles: { fillColor: [243, 232, 255], textColor: [107, 33, 168] }, // purple-100, purple-800
    columnStyles: {
      0: { cellWidth: 30 },
      2: { halign: 'right' }
    }
  })

  finalY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? finalY) + 10

  // Summary
  doc.setFillColor(243, 244, 246) // gray-100
  doc.rect(14, finalY, 182, 15, 'F')
  
  doc.setFontSize(12)
  doc.setTextColor(0)
  doc.text('Total Liabilities & Equity', 20, finalY + 10)
  doc.text(formatCurrency(totalLiabilities + totalEquity), 190, finalY + 10, { align: 'right' })

  addFooter(doc)
  doc.save(`balance-sheet-${asOfDate}.pdf`)
}

export const generateTrialBalancePDF = (
  data: TrialBalanceRow[], 
  startDate: string, 
  endDate: string, 
  tenantName: string = 'LedgerAI'
) => {
  const doc = new jsPDF()
  
  const totalDebits = data.reduce((sum, row) => sum + row.debit_amount, 0)
  const totalCredits = data.reduce((sum, row) => sum + row.credit_amount, 0)
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

  addHeader(
    doc, 
    'Trial Balance', 
    `Period: ${startDate ? format(new Date(startDate), 'MMM dd, yyyy') : 'All Time'} - ${format(new Date(endDate), 'MMM dd, yyyy')}`,
    tenantName
  )

  autoTable(doc, {
    startY: 35,
    head: [['Code', 'Account Name', 'Type', 'Debit', 'Credit', 'Balance']],
    body: [
      ...data.map(row => [
        row.account_code, 
        row.account_name, 
        row.account_type,
        formatCurrency(row.debit_amount),
        formatCurrency(row.credit_amount),
        formatCurrency(Math.abs(row.balance))
      ]),
      [
        '', 
        { content: 'TOTAL', styles: { fontStyle: 'bold' } }, 
        '',
        { content: formatCurrency(totalDebits), styles: { fontStyle: 'bold' } },
        { content: formatCurrency(totalCredits), styles: { fontStyle: 'bold' } },
        { content: isBalanced ? 'Balanced' : 'Out of Balance', styles: { fontStyle: 'bold', textColor: isBalanced ? [22, 163, 74] : [220, 38, 38] } }
      ]
    ],
    theme: 'striped',
    headStyles: { fillColor: [55, 65, 81], textColor: [255, 255, 255] }, // gray-700
    columnStyles: {
      0: { cellWidth: 25 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' }
    }
  })

  addFooter(doc)
  doc.save(`trial-balance-${endDate}.pdf`)
}
