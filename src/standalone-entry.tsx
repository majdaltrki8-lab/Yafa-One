import React from 'react'
import { createRoot } from 'react-dom/client'
import LegacyRoot from './components/LegacyRoot'

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(<LegacyRoot />)
}
