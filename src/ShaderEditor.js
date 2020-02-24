import React, { useCallback, useRef, useState, useEffect } from 'react'
import styled from 'styled-components/macro'
import Rete from 'rete'
import ReactRenderPlugin from 'rete-react-render-plugin'
import ConnectionPlugin from 'rete-connection-plugin'
import AreaPlugin from 'rete-area-plugin'
import { VERSION_STRING } from './version.js'
import { ShaderGenerator } from './shaderGenerator.js'

const colorRgbSocket = new Rete.Socket('rgba')

class WebcamComponent extends Rete.Component {
  constructor() {
    super('Webcam')
  }

  builder(node) {
    node.addOutput(new Rete.Output('color', 'color', colorRgbSocket))
  }

  worker(node, inputs, outputs, shaderGen) {
    // TODO: support coordinate input
    outputs.color = shaderGen.textureSample(0, 0)
  }
}

class CanvasComponent extends Rete.Component {
  constructor() {
    super('Canvas')
  }

  builder(node) {
    node.addInput(new Rete.Input('color', 'color', colorRgbSocket))
  }

  worker(node, inputs, outputs, shaderGen) {
    const color = inputs.color.length
      ? shaderGen.referenceVariable(inputs.color[0])
      : 'vec4(0.0, 0.0, 0.0, 1.0)'
    shaderGen.fragColor(color)
  }
}

class CoolColorComponent extends Rete.Component {
  constructor() {
    super('Cool Color')
  }

  builder(node) {
    node.addOutput(new Rete.Output('color', 'color', colorRgbSocket))
  }

  worker(node, inputs, outputs, shaderGen) {
    outputs.color = shaderGen.makeVariable('vec4', 'color', 'vec4(0.0, 0.7, 0.7, 1.0)')
  }
}

const RETE_COMPONENTS = [new CanvasComponent(), new WebcamComponent(), new CoolColorComponent()]

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
          const shaderGen = new ShaderGenerator()
          // TODO: handle multiple canvases better? don't allow them to be removed/added?
          const canvasId = editor.nodes.find(n => n.name === 'Canvas')?.id
          await engine.process(editor.toJSON(), canvasId, shaderGen)
          onShaderGeneratedRef.current(shaderGen.getSource())
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
  width: 200px;
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
  const style = {
    left: position?.x ?? 0,
    top: position?.y ?? 0,
  }

  const items = []
  if (components) {
    let i = 0
    for (const name of components.keys()) {
      items.push(
        <MenuItem key={i++} onClick={() => onInsert(name)}>
          {name}
        </MenuItem>,
      )
    }
  }

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
