import dedent from 'dedent'

function glFloatify(num) {
  const str = num.toString()
  return str.includes('.') ? str : `${str}.0`
}

export class ShaderGenerator {
  _inputsSource = dedent`
    varying vec2 vTexCoord;

    uniform vec2 resolution;
    uniform sampler2D videoTexture;
  `
  _mainSource = ``
  _variables = new Set()
  _unreferencedVariables = new Map()

  _id = 0
  _textureSamples = new Map()
  _fragColor = 'vec4(0.0, 0.0, 0.0, 1.0)'

  // Creates a variable of `type` with a name generated based on `baseName` and
  // a value determined by `valueCode`. The variable definition will only be
  // added to the code if something references it (with `referenceVariable`).
  //
  // Returns the name of the variable.
  makeVariable(type, baseName, valueCode) {
    const name = `${baseName}_${this._id++}`
    this._unreferencedVariables.set(name, `${type} ${name} = ${valueCode};`)
    this._variables.add(name)

    return name
  }

  // Marks a reference to a particular variable. Returns the name of the variable.
  referenceVariable(name) {
    if (!this._variables.has(name)) {
      throw new Error(`No variable named ${name} found`)
    }

    if (this._unreferencedVariables.has(name)) {
      this._mainSource += this._unreferencedVariables.get(name)
      this._unreferencedVariables.delete(name)
    }

    return name
  }

  // Returns the name of a variable containing the sampled texture value for
  // a particular x and y offset from the current texture coordinate.
  textureSample(xOffset, yOffset) {
    const cacheKey = `${xOffset},${yOffset}`
    if (this._textureSamples.has(cacheKey)) {
      return this._textureSamples.get(cacheKey)
    }

    let offsetCode = ''

    if (xOffset !== 0 || yOffset !== 0) {
      offsetCode =
        ' + vec2(' +
        // TODO: maybe resolution conversion should be handled via special nodes?
        `${glFloatify(xOffset)} / resolution.x, ` +
        `${glFloatify(yOffset)} / resolution.y` +
        ')'
    }

    const variable = this.makeVariable(
      'vec4',
      'tex',
      `texture2D(videoTexture, vTexCoord${offsetCode})`,
    )
    return variable
  }

  // Sets the gl_FragColor to the specified value.
  fragColor(value) {
    this._fragColor = `${value}`
  }

  getSource() {
    return dedent`
    precision mediump float;

    ${this._inputsSource.trim()}

    void main() {
      ${this._mainSource.trim()}

      gl_FragColor = ${this._fragColor};
    }`
  }
}
