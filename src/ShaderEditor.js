import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import styled from 'styled-components/macro'
import Rete from 'rete'
import ReactRenderPlugin from 'rete-react-render-plugin'
import ConnectionPlugin from 'rete-connection-plugin'
import AreaPlugin from 'rete-area-plugin'
import { VERSION_STRING } from './version.js'
import {
  PartialShader,
  GlFloat,
  GlVec2,
  GlVec4,
  GlVarDef,
  GlVarRef,
  glExpr,
  GlSetFragColorStatement,
  generateShader,
} from './shaderGenerator.js'

const colorRgbaSocket = new Rete.Socket('rgba')
const floatSocket = new Rete.Socket('float')

class WebcamComponent extends Rete.Component {
  constructor() {
    super('Webcam')
  }

  builder(node) {
    node.addOutput(new Rete.Output('color', 'color', colorRgbaSocket))
  }

  worker(node, inputs, outputs) {
    // TODO: support coordinate input
    const offsetX = new GlFloat(0)
    const offsetY = new GlFloat(0)
    const sampleCoord = new GlVec2(
      glExpr`${offsetX} / resolution.x`,
      glExpr`${offsetY} / resolution.y`,
    )
    const varName = `tex_${node.id}`
    outputs.color = new PartialShader(
      [new GlVarDef(varName, 'vec4', glExpr`texture2D(videoTexture, vTexCoord + ${sampleCoord})`)],
      new GlVarRef(varName),
    )
  }
}

class CanvasComponent extends Rete.Component {
  constructor() {
    super('Canvas')
  }

  builder(node) {
    node.addInput(new Rete.Input('color', 'color', colorRgbaSocket))
  }

  worker(node, inputs, outputs, results) {
    const shader = inputs.color.length
      ? inputs.color[0]
      : new PartialShader(
          [],
          new GlVec4(new GlFloat(0), new GlFloat(0), new GlFloat(0), new GlFloat(1)),
        )

    const finalShader = shader.completeStatement([
      new GlSetFragColorStatement(shader.workingExpression),
    ])

    results.set(node.id, finalShader)
  }
}

class CoolColorComponent extends Rete.Component {
  constructor() {
    super('Cool Color')
  }

  builder(node) {
    node.addOutput(new Rete.Output('color', 'color', colorRgbaSocket))
  }

  worker(node, inputs, outputs) {
    outputs.color = new PartialShader(
      [],
      new GlVec4(new GlFloat(0.0), new GlFloat(0.7), new GlFloat(0.7), new GlFloat(1.0)),
    )
  }
}

class BlendColorsComponent extends Rete.Component {
  constructor() {
    super('Blend Colors')
  }

  builder(node) {
    node.addInput(new Rete.Input('colorA', 'color A', colorRgbaSocket))
    node.addInput(new Rete.Input('colorB', 'color B', colorRgbaSocket))
    node.addOutput(new Rete.Output('color', 'color', colorRgbaSocket))
  }

  worker(node, inputs, outputs) {
    if (!inputs.colorA.length && !inputs.colorB.length) {
      outputs.color = new PartialShader(
        [],
        new GlVec4(new GlFloat(0.0), new GlFloat(0.0), new GlFloat(0.0), new GlFloat(1.0)),
      )
    } else if (!inputs.colorA.length || !inputs.colorB.length) {
      outputs.color = inputs.colorA.length ? inputs.colorA[0] : inputs.colorB[0]
    } else {
      const colorA = inputs.colorA[0]
      const colorB = inputs.colorB[0]

      outputs.color = colorA.combineWith(
        colorB,
        undefined,
        glExpr`(${colorA.workingExpression} + ${colorB.workingExpression}) / 2.0`,
      )
    }
  }
}

class SplitRgbaComponent extends Rete.Component {
  constructor() {
    super('Color Components - Split')
  }

  builder(node) {
    node.addInput(new Rete.Input('color', 'color', colorRgbaSocket))

    node.addOutput(new Rete.Output('red', 'red', floatSocket))
    node.addOutput(new Rete.Output('green', 'green', floatSocket))
    node.addOutput(new Rete.Output('blue', 'blue', floatSocket))
    node.addOutput(new Rete.Output('alpha', 'alpha', floatSocket))
  }

  worker(node, inputs, outputs) {
    const inputShader = inputs.color.length
      ? inputs.color[0]
      : new PartialShader([], glExpr`vec4(0.0, 0.0, 0.0, 1.0)`)
    const inputColor = inputShader.workingExpression

    outputs.red = inputShader.updateWorkingExpression(glExpr`(${inputColor}).r`)
    outputs.green = inputShader.updateWorkingExpression(glExpr`(${inputColor}).g`)
    outputs.blue = inputShader.updateWorkingExpression(glExpr`(${inputColor}).b`)
    outputs.alpha = inputShader.updateWorkingExpression(glExpr`(${inputColor}).a`)
  }
}

class JoinRgbaComponent extends Rete.Component {
  constructor() {
    super('Color Components - Join')
  }

  builder(node) {
    node.addInput(new Rete.Input('red', 'red', floatSocket))
    node.addInput(new Rete.Input('green', 'green', floatSocket))
    node.addInput(new Rete.Input('blue', 'blue', floatSocket))
    node.addInput(new Rete.Input('alpha', 'alpha', floatSocket))

    node.addOutput(new Rete.Output('color', 'color', colorRgbaSocket))
  }

  worker(node, inputs, outputs) {
    const inputRed = this._inputOrDefault(inputs.red)
    const inputGreen = this._inputOrDefault(inputs.green)
    const inputBlue = this._inputOrDefault(inputs.blue)
    const inputAlpha = this._inputOrDefault(inputs.alpha)

    const red = inputRed.workingExpression
    const green = inputGreen.workingExpression
    const blue = inputBlue.workingExpression
    const alpha = inputAlpha.workingExpression

    const resultVec = glExpr`vec4(${red}, ${green}, ${blue}, ${alpha})`

    outputs.color = inputRed
      .combineWith(inputGreen)
      .combineWith(inputBlue)
      .combineWith(inputAlpha, [], resultVec)
  }

  _inputOrDefault(input) {
    return input.length ? input[0] : new PartialShader([], new GlFloat(0.0))
  }
}

const RETE_COMPONENTS = [
  new CanvasComponent(),
  new WebcamComponent(),
  new CoolColorComponent(),
  new BlendColorsComponent(),
  new SplitRgbaComponent(),
  new JoinRgbaComponent(),
]

const ShaderEditorContent = styled.div`
  position: relative;
  min-width: 66%;
  height: 100%;
  flex-grow: 1;
  background-color: #303030;
`

const NodeEditor = styled.div`
  width: 100%;
  height: 100%;
`

const NODE_ACTIONS = [
  ['delete', 'Delete node'],
  ['clone', 'Clone node'],
]

export function ShaderEditor(props) {
  const getInitialStateRef = useRef()
  const onChangeRef = useRef()
  const onShaderGeneratedRef = useRef()
  const engineRef = useRef()
  const processingRef = useRef()

  const [editor, setEditor] = useState()
  const [insertMenuPos, setInsertMenuPos] = useState()
  const [nodeMenuState, setNodeMenuState] = useState()

  getInitialStateRef.current = props.getInitialState
  onChangeRef.current = props.onChange
  onShaderGeneratedRef.current = props.onShaderGenerated
  engineRef.current = props.engine

  const editorCallback = useCallback(editorElem => {
    if (!editorElem) {
      return
    }

    const editor = new Rete.NodeEditor(VERSION_STRING, editorElem)
    editor.use(ReactRenderPlugin)
    editor.use(ConnectionPlugin)
    editor.use(AreaPlugin)

    for (const component of RETE_COMPONENTS) {
      editor.register(component)
      engineRef.current.register(component)
    }

    const initialState = getInitialStateRef.current()
    const initPromise = initialState
      ? editor.fromJSON(initialState)
      : Promise.all([
          editor.components.get('Webcam').createNode(),
          editor.components.get('Canvas').createNode(),
        ]).then(([webcamNode, canvasNode]) => {
          webcamNode.position = [0, 0]
          canvasNode.position = [400, 0]

          editor.addNode(webcamNode)
          editor.addNode(canvasNode)
          editor.connect(webcamNode.outputs.get('color'), canvasNode.inputs.get('color'))
        })

    initPromise.then(() => {
      editor.on(
        'nodecreated noderemoved nodetranslated connectioncreated connectionremoved',
        () => {
          if (onChangeRef.current) {
            onChangeRef.current(editor.toJSON())
          }
        },
      )
      editor.on('process nodecreated noderemoved connectioncreated connectionremoved', async () => {
        if (!engineRef.current) return

        if (processingRef.current) return

        processingRef.current = true

        try {
          await Promise.resolve()
          const engine = engineRef.current
          await engine.abort()
          const canvasResults = new Map()
          // TODO: handle multiple canvases better? don't allow them to be removed/added?
          const canvasId = editor.nodes.find(n => n.name === 'Canvas')?.id
          await engine.process(editor.toJSON(), canvasId, canvasResults)
          if (canvasResults.has(canvasId)) {
            onShaderGeneratedRef.current(generateShader(canvasResults.get(canvasId)))
          }
        } finally {
          processingRef.current = false
        }
      })

      editor.view.resize()
      editor.trigger('process')
      AreaPlugin.zoomAt(editor, editor.nodes)
    })

    setEditor(editor)
  }, [])

  useEffect(() => {
    if (!editor) return

    editor.on('click', () => {
      setNodeMenuState(null)
      setInsertMenuPos(null)
    })
    editor.on('contextmenu', ({ e, node }) => {
      e.preventDefault()
      e.stopPropagation()

      if (node) {
        setNodeMenuState({ position: { x: e.clientX, y: e.clientY }, node })
        setInsertMenuPos(null)
      } else {
        setNodeMenuState(null)
        setInsertMenuPos({ x: e.clientX, y: e.clientY })
      }
    })
  }, [editor])

  const onInsert = name => {
    const component = editor.components.get(name)
    component.createNode().then(node => {
      const mousePos = editor.view.area.mouse
      node.position = [mousePos.x, mousePos.y]
      editor.addNode(node)
      setInsertMenuPos(null)
    })
  }

  const onNodeAction = (node, action) => {
    if (action === 'delete') {
      editor.removeNode(node)
      setNodeMenuState(null)
    } else if (action === 'clone') {
      const {
        name,
        position: [x, y],
        data,
        meta,
      } = node
      const component = editor.components.get(name)
      const copiedData = JSON.parse(JSON.stringify(data))
      const copiedMeta = JSON.parse(JSON.stringify(meta))
      component.createNode(copiedData).then(node => {
        node.meta = copiedMeta
        node.position = [x + 10, y + 10]
        editor.addNode(node)
        setNodeMenuState(null)
      })
    }
  }

  return (
    <ShaderEditorContent>
      <NodeEditor ref={editorCallback} />
      <InsertMenu
        position={insertMenuPos}
        show={!!insertMenuPos}
        components={editor?.components}
        onInsert={onInsert}
      />
      <NodeMenu
        position={nodeMenuState?.position}
        show={!!nodeMenuState}
        node={nodeMenuState?.node}
        actions={NODE_ACTIONS}
        onAction={onNodeAction}
      />
    </ShaderEditorContent>
  )
}

const MenuContainer = styled.div`
  position: fixed;
  width: 240px;
  max-height: 320px;
  overflow-y: auto;
  display: ${props => (props.show ? 'block' : 'none')};
  background-color: #424242;
  padding-top: 4px;
  padding-bottom: 4px;
  border-radius: 4px;
  box-shadow: 0px 2px 4px -1px rgba(0, 0, 0, 0.2), 0px 4px 5px 0px rgba(0, 0, 0, 0.14),
    0px 1px 10px 0px rgba(0, 0, 0, 0.12);
`

const MenuItem = styled.div`
  width: 100%;
  height: 32px;
  padding: 4px 8px;
  line-height: 24px;
  cursor: pointer;
  user-select: none;

  &:hover {
    background-color: rgba(255, 255, 255, 0.12);
  }

  &:active {
    background-color: rgba(255, 255, 255, 0.16);
  }
`

const MenuHeader = styled.div`
  width: 100%;
  height: 36px;
  padding: 4px 8px 8px;
  line-height: 24px;

  font-size: 14px;
  font-weight: 500;
`

function InsertMenu({ show, position, components, onInsert }) {
  const onInsertRef = useRef()
  onInsertRef.current = onInsert

  const style = {
    left: position?.x ?? 0,
    top: position?.y ?? 0,
  }

  const items = useMemo(() => {
    console.log('resorting')

    const result = []
    if (components) {
      let i = 0
      console.dir(Array.from(components.keys()))
      const componentNames = Array.from(components.keys()).sort((a, b) => a.localeCompare(b))
      for (const name of componentNames) {
        result.push(
          <MenuItem key={i++} onClick={() => onInsertRef.current(name)}>
            {name}
          </MenuItem>,
        )
      }
    }

    return result
  }, [components])

  return (
    <MenuContainer show={show} style={style}>
      <MenuHeader>Insert</MenuHeader>
      {items}
    </MenuContainer>
  )
}

function NodeMenu({ show, position, node, actions, onAction }) {
  const style = {
    left: position?.x ?? 0,
    top: position?.y ?? 0,
  }

  const items = actions.map((action, i) => (
    <MenuItem key={i} onClick={() => onAction(node, action[0])}>
      {action[1]}
    </MenuItem>
  ))
  return (
    <MenuContainer show={show} style={style}>
      {items}
    </MenuContainer>
  )
}
