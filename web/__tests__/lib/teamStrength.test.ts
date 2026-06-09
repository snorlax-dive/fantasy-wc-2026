import { describe, it, expect } from 'vitest'
import { teamRatings } from '@/lib/teamStrength'

describe('teamRatings — known teams', () => {
  it('France → { attack: 0.95, defense: 0.88 }', () => {
    expect(teamRatings('France')).toEqual({ attack: 0.95, defense: 0.88 })
  })
  it('Argentina → { attack: 0.9, defense: 0.92 }', () => {
    expect(teamRatings('Argentina')).toEqual({ attack: 0.9, defense: 0.92 })
  })
  it('Morocco → has high defense', () => {
    const r = teamRatings('Morocco')
    expect(r.defense).toBeGreaterThan(r.attack)
  })
  it('Norway → has high attack (Haaland-powered)', () => {
    const r = teamRatings('Norway')
    expect(r.attack).toBeGreaterThan(r.defense)
  })
})

describe('teamRatings — case insensitivity', () => {
  it('lowercase "france" → same result', () => {
    expect(teamRatings('france')).toEqual(teamRatings('France'))
  })
  it('uppercase "FRANCE" → same result', () => {
    expect(teamRatings('FRANCE')).toEqual(teamRatings('France'))
  })
  it('mixed case "fRaNcE" → same result', () => {
    expect(teamRatings('fRaNcE')).toEqual(teamRatings('France'))
  })
})

describe('teamRatings — alternate spellings', () => {
  it('"USA" and "United States" → same ratings', () => {
    expect(teamRatings('USA')).toEqual(teamRatings('United States'))
  })
  it('"Korea Republic" and "South Korea" → same ratings', () => {
    expect(teamRatings('Korea Republic')).toEqual(teamRatings('South Korea'))
  })
  it('"Czechia" and "Czech Republic" → same ratings', () => {
    expect(teamRatings('Czechia')).toEqual(teamRatings('Czech Republic'))
  })
  it('"Curaçao" and "Curacao" (without cedilla) → same ratings', () => {
    expect(teamRatings('Curaçao')).toEqual(teamRatings('curacao'))
  })
  it('"DR Congo" and "Congo" → same ratings', () => {
    expect(teamRatings('DR Congo')).toEqual(teamRatings('Congo'))
  })
})

describe('teamRatings — null/undefined/unknown', () => {
  it('null → default { attack: 0.55, defense: 0.55 }', () => {
    expect(teamRatings(null)).toEqual({ attack: 0.55, defense: 0.55 })
  })
  it('undefined → default', () => {
    expect(teamRatings(undefined)).toEqual({ attack: 0.55, defense: 0.55 })
  })
  it('empty string → default', () => {
    expect(teamRatings('')).toEqual({ attack: 0.55, defense: 0.55 })
  })
  it('unknown team name → default', () => {
    expect(teamRatings('Narnia FC')).toEqual({ attack: 0.55, defense: 0.55 })
  })
})

describe('teamRatings — debutants present', () => {
  it('Cape Verde → not default', () => {
    expect(teamRatings('Cape Verde')).not.toEqual({ attack: 0.55, defense: 0.55 })
  })
  it('Jordan → not default', () => {
    expect(teamRatings('Jordan')).not.toEqual({ attack: 0.55, defense: 0.55 })
  })
  it('Uzbekistan → not default', () => {
    expect(teamRatings('Uzbekistan')).not.toEqual({ attack: 0.55, defense: 0.55 })
  })
})

describe('teamRatings — all ratings within valid range', () => {
  const teams = [
    'France', 'England', 'Spain', 'Portugal', 'Netherlands', 'Germany', 'Croatia',
    'Belgium', 'Switzerland', 'Norway', 'Austria', 'Scotland', 'Sweden', 'Turkey',
    'Argentina', 'Brazil', 'Uruguay', 'Colombia', 'Ecuador', 'Paraguay',
    'USA', 'Mexico', 'Canada', 'Panama', 'Curacao', 'Haiti',
    'Morocco', 'Senegal', 'Egypt', 'Tunisia', 'Algeria', 'Ghana',
    'Ivory Coast', 'South Africa', 'Cape Verde', 'DR Congo',
    'Japan', 'Korea Republic', 'Iran', 'Saudi Arabia', 'Qatar',
    'Australia', 'Jordan', 'Uzbekistan', 'Iraq', 'New Zealand',
  ]
  it.each(teams)('%s attack and defense are between 0.4 and 0.95', (team) => {
    const r = teamRatings(team)
    expect(r.attack).toBeGreaterThanOrEqual(0.4)
    expect(r.attack).toBeLessThanOrEqual(0.95)
    expect(r.defense).toBeGreaterThanOrEqual(0.4)
    expect(r.defense).toBeLessThanOrEqual(0.95)
  })
})
