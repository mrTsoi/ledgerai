import React, { useState } from 'react'

export function Select({ children }: any) {
  return <div>{children}</div>
}

export function SelectTrigger({ children, onClick }: any) {
  return (
    <button data-testid="mock-select-trigger" onClick={onClick}>
      {children}
    </button>
  )
}

export function SelectContent({ children }: any) {
  return <div data-testid="mock-select-content">{children}</div>
}

export function SelectItem({ children, onClick }: any) {
  return (
    <button role="option" onClick={onClick}>
      {children}
    </button>
  )
}

export default Select
