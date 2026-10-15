import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WebSources from './WebSources.tsx'

describe('the sources under a reply', () => {
  const sources = [{ title: 'Gift boxes in Pretoria', url: 'https://example.co.za/boxes' }]

  it('says Google Search for a Google answer', () => {
    render(<WebSources grounding={{ queries: ['gift boxes'], sources }} />)
    expect(screen.getByText('Sources from Google Search')).toBeInTheDocument()
  })

  it('says it was the web, and what was searched for, for the app\'s own research, with links that open in a new tab', () => {
    render(<WebSources grounding={{ queries: ['gift box competitors'], sources, via: 'web' }} />)
    expect(screen.getByText('Sources from the web, searched for “gift box competitors”')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Gift boxes in Pretoria' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
    expect(screen.queryByTitle('Google Search suggestions')).not.toBeInTheDocument()
  })
})
