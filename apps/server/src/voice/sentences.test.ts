import { describe, expect, it } from 'vitest'
import { SentenceSplitter } from './sentences.js'

const run = (...pieces: string[]): string[] => {
  const s = new SentenceSplitter()
  const out = pieces.flatMap((p) => s.push(p))
  const rest = s.flush()
  return rest ? [...out, rest] : out
}

describe('SentenceSplitter', () => {
  it('emits a sentence as soon as its stop and the following space arrive', () => {
    const s = new SentenceSplitter()
    expect(s.push('Abri a telemetria na tela.')).toEqual([])
    expect(s.push(' O')).toEqual(['Abri a telemetria na tela.'])
  })

  it('does not wait for the end of the answer to emit the first sentence', () => {
    expect(run('O servidor está estável. ', 'A CPU está em quarenta por cento.')).toEqual(['O servidor está estável.', 'A CPU está em quarenta por cento.'])
  })

  it('works when the text arrives in small pieces', () => {
    expect(run('O ser', 'vidor está ', 'estável', '. A CPU ', 'está bem.')).toEqual(['O servidor está estável.', 'A CPU está bem.'])
  })

  it('keeps versions and decimals whole', () => {
    expect(run('Atualizei o aqw-idle para a versão 2.4.1 com sucesso. Tudo certo.')).toEqual(['Atualizei o aqw-idle para a versão 2.4.1 com sucesso.', 'Tudo certo.'])
  })

  it('merges a very short sentence into the next one', () => {
    expect(run('Ok. Abri a janela de telemetria agora mesmo.')).toEqual(['Ok. Abri a janela de telemetria agora mesmo.'])
  })

  it('flushes a trailing piece with no stop', () => {
    expect(run('Tudo certo por aqui')).toEqual(['Tudo certo por aqui'])
  })

  it('splits a very long run at a comma or space', () => {
    const long = `${'palavra, '.repeat(40)}fim`
    const parts = run(long)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((p) => p.length <= 220)).toBe(true)
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long)
  })

  it('treats line breaks as stops', () => {
    expect(run('Primeira linha bem comprida aqui\nSegunda linha bem comprida aqui')).toEqual(['Primeira linha bem comprida aqui', 'Segunda linha bem comprida aqui'])
  })
})
