import React, { useCallback, useState, useEffect } from 'react'
import styled from 'styled-components/macro'
import * as twgl from 'twgl.js'

const vertexShader = `
  attribute vec2 aPosition;
  attribute vec2 aTexCoord;

  varying vec2 vTexCoord;

  void main() {
    gl_Position = vec4(aPosition, 0, 1);
    vTexCoord = aTexCoord;
  }
`

function initGl(gl, fragmentShader, videoElem) {
  const programInfo = twgl.createProgramInfo(gl, [vertexShader, fragmentShader])
  const texture = twgl.createTexture(gl, {
    level: 0,
    internalFormat: gl.RGBA,
    width: videoElem.videoWidth,
    height: videoElem.videoHeight,
    wrapS: gl.CLAMP_TO_EDGE,
    wrapT: gl.CLAMP_TO_EDGE,
    min: gl.LINEAR,
  })

  const arrays = {
    aPosition: {
      numComponents: 2,
      data: [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0, -1.0, 1.0, 1.0, 1.0, -1.0],
    },
    aTexCoord: {
      numComponents: 2,
      data: [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0],
    },
  }
  const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays)

  return { programInfo, bufferInfo, texture }
}

function renderGl(gl, glData, video, signal) {
  if (signal.aborted) {
    return
  }

  const { programInfo, bufferInfo, texture } = glData

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  twgl.setTextureFromElement(gl, texture, video, { auto: false })

  gl.useProgram(programInfo.program)
  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo)
  twgl.setUniforms(programInfo, {
    resolution: [gl.canvas.width, gl.canvas.height],
    videoTexture: texture,
  })
  twgl.drawBufferInfo(gl, bufferInfo)

  requestAnimationFrame(() => renderGl(gl, glData, video, signal))
}

const WebcamNotice = styled.p`
  font-size: 24px;
  font-weight: 500;
  display: ${props => (props.hidden ? 'none' : 'block')};
`

const FitCanvas = styled.canvas`
  width: 100%;
  max-height: 100%;
  object-fit: contain;
`

export function VideoCanvas(props) {
  const { className, fragmentShader, video } = props

  const [gl, setGl] = useState(null)
  const canvasRef = useCallback(canvasElem => {
    if (canvasElem) {
      setGl(canvasElem.getContext('webgl'))
    } else {
      setGl(null)
    }
  }, [])

  useEffect(() => {
    if (!gl || !video || !fragmentShader) {
      return
    }

    const glData = initGl(gl, fragmentShader, video)

    const aborter = new AbortController()
    const signal = aborter.signal

    requestAnimationFrame(() => renderGl(gl, glData, video, signal))

    return () => aborter.abort()
  }, [gl, fragmentShader, video])

  return (
    <div className={className}>
      <WebcamNotice hidden={!!video}>
        Please accept the webcam permission dialog to continue.
      </WebcamNotice>
      <FitCanvas
        ref={canvasRef}
        width={video?.videoWidth ?? 1280}
        height={video?.videoHeight ?? 720}
      />
    </div>
  )
}
