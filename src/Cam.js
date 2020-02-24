import React, { useCallback, useState, useEffect, useRef } from 'react'

const STATUS_UNREQUESTED = 0
const STATUS_PENDING = 1
const STATUS_SUCCESS = 2
const STATUS_FAILED = -1

function useWebcam(constraints) {
  const [stream, setStream] = useState()
  const [error, setError] = useState()
  const [status, setStatus] = useState(STATUS_UNREQUESTED)

  const constraintJson = JSON.stringify(constraints)
  useEffect(() => {
    let isCanceled = false

    setStatus(STATUS_PENDING)
    navigator.mediaDevices.getUserMedia(constraints).then(
      stream => {
        if (!isCanceled) {
          setStatus(STATUS_SUCCESS)
          setStream(stream)
        } else {
          for (const track of stream.getTracks()) {
            track.stop()
            stream.removeTrack(track)
          }
        }
      },
      err => {
        setStatus(STATUS_FAILED)
        setError(err)
      },
    )

    return () => {
      isCanceled = true
    }

    // This is equivalent to `constraints` but actually (reasonably) checkable for equality
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constraintJson])

  useEffect(() => {
    return () => {
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop()
          stream.removeTrack(track)
        }
      }
    }
  })

  return { status, stream, error }
}

export const Cam = React.memo(props => {
  const onActiveVideoRef = useRef()

  const { onActiveVideo, ...rest } = props

  onActiveVideoRef.current = onActiveVideo

  const { stream } = useWebcam({
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  })
  const videoRef = useCallback(
    videoElem => {
      if (videoElem) {
        videoElem.srcObject = stream
        videoElem.play()
      } else {
        onActiveVideoRef.current(null)
      }
    },
    [stream],
  )

  return (
    <div {...rest}>
      <video
        ref={videoRef}
        muted={true}
        playsInline={true}
        onPlaying={event => {
          if (stream) {
            onActiveVideoRef.current(event.target)
          }
        }}></video>
    </div>
  )
})
