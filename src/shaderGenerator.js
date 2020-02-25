import dedent from 'dedent'

function glFloatify(num) {
  const str = num.toString()
  return str.includes('.') ? str : `${str}.0`
}

export class GlFloat {
  constructor(value) {
    this.value = value
  }

  get glType() {
    return 'float'
  }

  toGlsl() {
    return glFloatify(this.value)
  }

  getRefs() {
    return []
  }
}

class _GlVecBase {
  constructor(glType) {
    this._glType = glType
  }

  get glType() {
    return this._glType
  }

  toGlsl() {
    return `${this.glType}(${this.values.map(n => n.toGlsl()).join(', ')})`
  }

  getRefs() {
    return this.values.flatMap(n => n.getRefs())
  }
}

export class GlVec2 extends _GlVecBase {
  constructor(n0, n1) {
    super('vec2')
    this.values = [n0, n1]
  }
}

export class GlVec3 extends _GlVecBase {
  constructor(n0, n1, n2) {
    super('vec3')
    this.values = [n0, n1, n2]
  }
}

export class GlVec4 extends _GlVecBase {
  constructor(n0, n1, n2, n3) {
    super('vec4')
    this.values = [n0, n1, n2, n3]
  }
}

export class GlVarDef {
  constructor(name, type, valueExpression) {
    this.name = name
    this.type = type
    this.valueExpression = valueExpression
  }

  ref() {
    return new GlVarRef(this.name)
  }

  toGlsl() {
    return `${this.type} ${this.name} = ${this.valueExpression.toGlsl()};\n`
  }

  getRefs() {
    return this.valueExpression.getRefs()
  }
}

export class GlVarRef {
  constructor(name) {
    this.name = name
  }

  toGlsl() {
    return this.name
  }

  getRefs() {
    return [this]
  }
}

export class GlExpression {
  constructor(parts) {
    this.parts = parts
  }

  append(parts) {
    return new GlExpression([...this.parts, ...parts])
  }

  prepend(parts) {
    return new GlExpression([...parts, ...this.parts])
  }

  toGlsl() {
    return this.parts.map(p => (typeof p === 'string' ? p : p.toGlsl())).join('')
  }

  getRefs() {
    return this.parts.flatMap(p => (typeof p === 'string' ? [] : p.getRefs()))
  }
}

export class GlSetFragColorStatement {
  constructor(valueExpression) {
    this.valueExpression = valueExpression
  }

  toGlsl() {
    return `gl_FragColor = ${this.valueExpression.toGlsl()};\n`
  }

  getRefs() {
    return this.valueExpression.getRefs()
  }
}

export class PartialShader {
  constructor(statements, workingExpression) {
    this.statements = statements
    this.workingExpression = workingExpression
  }

  completeStatement(statements) {
    return new PartialShader([...this.statements, ...statements])
  }

  updateWorkingExpression(workingExpression) {
    return new PartialShader(this.statements, workingExpression)
  }

  combineWith(other, addedStatements = [], workingExpression) {
    return new PartialShader(
      [...this.statements, ...other.statements, ...addedStatements],
      workingExpression,
    )
  }
}

const INPUTS_SOURCE = dedent`
  varying vec2 vTexCoord;

  uniform vec2 resolution;
  uniform sampler2D videoTexture;
`

export function generateShader(partialShader) {
  const declaredVariables = new Set([])
  const unusedVariables = new Map()

  let mainSource = ''
  for (const statement of partialShader.statements) {
    let refsToResolve = []
    let codeToAdd = ''

    if (statement instanceof GlVarDef) {
      unusedVariables.set(statement.name, statement)
    } else if (statement instanceof GlSetFragColorStatement) {
      refsToResolve.push(...statement.getRefs())
      // TODO: handle tab levels or something
      codeToAdd = statement.toGlsl() + '      ' + codeToAdd
    }

    while (refsToResolve.length) {
      const resolving = refsToResolve
      refsToResolve = []

      for (const ref of resolving) {
        const name = ref.name
        if (declaredVariables.has(name)) {
          continue
        }
        if (!unusedVariables.has(name)) {
          throw new Error(`Variable '${name}' was referenced without being defined`)
        }

        const varDef = unusedVariables.get(name)
        refsToResolve.push(...varDef.getRefs())
        codeToAdd = varDef.toGlsl() + '      ' + codeToAdd
        unusedVariables.delete(name)
        declaredVariables.add(name)
      }
    }

    mainSource = codeToAdd + mainSource
  }

  return dedent`
    precision mediump float;

    ${INPUTS_SOURCE}

    void main() {
      ${mainSource}
    }`
}
