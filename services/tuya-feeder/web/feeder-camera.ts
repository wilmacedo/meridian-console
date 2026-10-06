const ICE_GATHER_TIMEOUT_MS = 3000

export interface CameraConnection {
  stream: MediaStream
  connection: RTCPeerConnection
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${url} responded ${res.status}`)
  return (await res.json()) as T
}

// go2rtc answers a complete offer (no trickle ICE), so wait for gathering to finish. The timeout
// keeps a slow interface from blocking the connection indefinitely.
function waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      connection.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => {
      if (connection.iceGatheringState === 'complete') finish()
    }
    const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS)
    connection.addEventListener('icegatheringstatechange', onChange)
  })
}

export async function connectFeederCamera(): Promise<CameraConnection> {
  await post('/api/services/tuya-feeder/camera/session')

  const connection = new RTCPeerConnection()
  const stream = new MediaStream()
  connection.addEventListener('track', (event) => stream.addTrack(event.track))
  connection.addTransceiver('video', { direction: 'recvonly' })
  connection.addTransceiver('audio', { direction: 'recvonly' })

  try {
    await connection.setLocalDescription(await connection.createOffer())
    await waitForIceGathering(connection)
    const local = connection.localDescription
    if (!local) throw new Error('missing local description')
    const answer = await post<RTCSessionDescriptionInit>('/api/services/tuya-feeder/camera/webrtc', {
      type: local.type,
      sdp: local.sdp,
    })
    await connection.setRemoteDescription(answer)
  } catch (err) {
    connection.close()
    throw err
  }

  return { stream, connection }
}
