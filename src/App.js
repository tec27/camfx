import React, { useState, useEffect } from 'react'
import styled, { createGlobalStyle } from 'styled-components/macro'
import Rete from 'rete'
import { Cam } from './Cam.js'
import { ShaderEditor } from './ShaderEditor.js'
import { VideoCanvas } from './VideoCanvas.js'
import { VERSION_STRING } from './version.js'

const GlobalStyle = createGlobalStyle`
  *, *:before, *:after {
    box-sizing: border-box;
  }

  html {
    width: 100%;
    height: 100%;
  }

  body {
    width: 100%;
    height: 100%;
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;

    background-color: #212121;
    color: #fff;
  }

  code, pre {
    font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
      monospace;
  }

  #root {
    width: 100%;
    height: 100%;
  }
`

const AppRoot = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
`

const HiddenCam = styled(Cam)`
  display: none;
`

const PreviewColumn = styled.div`
  min-width: 320px;
  height: 100%;
  flex-shrink: 1;
  display: flex;
  flex-direction: column;
`

const CodePreview = styled.pre`
  width: 100%;
  min-height: 320px;
  flex-grow: 1;
  flex-shrink: 1;
  overflow: auto;
  margin: 0;
  padding: 16px;

  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
`

function loadEditorState() {
  const stored = localStorage.getItem('editorState')
  try {
    return stored ? JSON.parse(stored) : undefined
  } catch (err) {
    return undefined
  }
}

function saveEditorState(state) {
  localStorage.setItem('editorState', JSON.stringify(state))
}

export function App() {
  const [activeVideo, setActiveVideo] = useState(null)
  const [reteEngine] = useState(() => new Rete.Engine(VERSION_STRING))
  const [shaderSrc, setShaderSrc] = useState('')

  useEffect(() => {
    reteEngine.on('error', err => console.log(err))
  }, [reteEngine])

  return (
    <>
      <GlobalStyle />
      <AppRoot>
        <HiddenCam onActiveVideo={setActiveVideo} />
        <PreviewColumn>
          <VideoCanvas fragmentShader={shaderSrc} video={activeVideo} />
          <CodePreview>{shaderSrc}</CodePreview>
        </PreviewColumn>
        <ShaderEditor
          engine={reteEngine}
          getInitialState={loadEditorState}
          onChange={saveEditorState}
          onShaderGenerated={setShaderSrc}
        />
      </AppRoot>
    </>
  )
}
