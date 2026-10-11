import { describe, expect, it } from 'vitest'
import { cleanOutline, elementFacts } from './outline.js'

const raw = [
  '@vom 1',
  '@view 1063x798',
  '@layers 2 focus=L1',
  'L1 modal cover=100%',
  '  group',
  '    Video "Unable to play media." [disabled]',
  '  @e1 button "Fechar"',
  '  heading "A MUDANÇA"',
  '    text "A MUDANÇA"',
  '      StaticText "A MUDANÇA"',
  '  @e6 button "css-build:shady css_build_scope:ytd-badge css_build_styles:video.a.b.c Continue a ver"',
  '  banner "BR"',
  '    @e7 button "Guia"',
  '    StaticText "BR"',
  '    search',
  '      form',
  '        @e10 combobox "Pesquisa [expanded]" placeholder="Pesquisa"',
  '      @e11 button',
  '        img',
  '      @e12 button "Search"',
  '    tooltip "tooltip"',
  '  navigation',
  '    @e17 link "Início" [ctx: css-build:shady css_build_scope:ytd-masthead css_build_styles:video.x]',
  '    group',
  '      group',
  '  form',
  '    @e20 button "Enviar"',
  '    @e21 textbox "Mensagem"',
  '@warning geometry incomplete',
  '@more observe --cursor abc-123; use this page\'s refs before continuing.',
].join('\n')

describe('cleanOutline', () => {
  const { text, cursor } = cleanOutline(raw)

  it('drops the CSS annotations from names and from [ctx] notes', () => {
    expect(text).not.toMatch(/css[-_]build/)
    expect(text).toContain('@e6 button "Continue a ver"')
    expect(text).toContain('@e17 link "Início"')
    expect(text).not.toContain('[ctx')
  })

  it('prints each text once', () => {
    expect(text.match(/A MUDANÇA/g)).toHaveLength(1)
    expect(text.match(/"BR"/g)).toHaveLength(1)
  })

  it('drops wrappers with nothing inside and the tooltips, keeps what can be acted on', () => {
    expect(text).not.toMatch(/tooltip|^\s*img/m)
    expect(text.match(/group/g)).toHaveLength(1)
    expect(text).toContain('@e11 button')
    expect(text).toContain('@e12 button "Search"')
  })

  it('takes the header lines and the continuation cursor out of the text', () => {
    expect(text).not.toMatch(/@vom|@view|@layers|@warning|@more/)
    expect(cursor).toBe('abc-123')
  })

  it('is much shorter than what it came from', () => {
    const big = Array.from({ length: 50 }, (_, i) => `  @e${i} link "Item ${i}" [ctx: css-build:shady css_build_scope:x css_build_styles:video.youtube.src.web.polymer.shared.ui.styles]\n    text "Item ${i}"\n      StaticText "Item ${i}"`).join('\n')
    expect(cleanOutline(big).text.length).toBeLessThan(big.length / 3)
  })
})

describe('elementFacts', () => {
  const facts = elementFacts(raw)

  it('reads role and name per ref', () => {
    expect(facts.get('e1')).toMatchObject({ role: 'button', name: 'Fechar', inDialog: true })
    expect(facts.get('e6')?.name).toBe('Continue a ver')
  })

  it('knows a search form from another form', () => {
    expect(facts.get('e10')).toMatchObject({ editable: true, inForm: true, formSearch: true })
    expect(facts.get('e12')).toMatchObject({ formSearch: true, isSubmit: false })
    expect(facts.get('e20')).toMatchObject({ isSubmit: true, formSearch: false })
    expect(facts.get('e21')).toMatchObject({ editable: true, inForm: true })
  })
})
