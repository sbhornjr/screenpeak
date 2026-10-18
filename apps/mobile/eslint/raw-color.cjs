/** Colour syntax that belongs in packages/shared/tokens.ts, not in a screen. */

const NAMED = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque',
  'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood',
  'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk',
  'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray',
  'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen',
  'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
  'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey',
  'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen',
  'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue',
  'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace',
  'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
  'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red',
  'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen',
  'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray',
  'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
  'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow',
  'yellowgreen',
]

const HEX = '#[0-9A-Fa-f]{3,}\\b'
const FUNCTION = '(?:rgba?|hsla?)\\('
const NAMED_SOURCE = `(?!transparent$)(?:${NAMED.join('|')})`

const namedWhole = new RegExp(`^${NAMED_SOURCE}$`, 'i')
const hexIn = new RegExp(HEX, 'g')
const functionIn = new RegExp(FUNCTION, 'gi')
const stringLiteral = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g

function hitsIn(value) {
  const found = []
  hexIn.lastIndex = 0
  functionIn.lastIndex = 0
  for (const match of value.matchAll(hexIn)) found.push(match[0])
  for (const match of value.matchAll(functionIn)) {
    const start = match.index ?? 0
    const rest = value.slice(start)
    const end = rest.indexOf(')')
    found.push(end === -1 ? match[0] : rest.slice(0, end + 1))
  }
  if (namedWhole.test(value)) found.push(value)
  return found
}

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Raw colours written as string literals in `source`. `transparent` is allowed. */
function rawColors(source) {
  const found = []
  hexIn.lastIndex = 0
  functionIn.lastIndex = 0
  for (const match of withoutComments(source).matchAll(stringLiteral)) {
    found.push(...hitsIn(match[0].slice(1, -1)))
  }
  return found
}

const MESSAGE = 'Use @/theme. Raw colours belong in packages/shared/tokens.ts.'

function selectors() {
  const patterns = [HEX, FUNCTION, `^${NAMED_SOURCE}$`]
  const flags = ['', 'i', 'i']
  const nodes = [
    ['Literal', 'value'],
    ['TemplateElement', 'value.raw'],
  ]
  const rules = []
  for (const [node, key] of nodes) {
    patterns.forEach((pattern, index) => {
      rules.push({
        selector: `${node}[${key}=/${pattern}/${flags[index]}]`,
        message: MESSAGE,
      })
    })
  }
  return rules
}

module.exports = { rawColors, selectors, MESSAGE }
