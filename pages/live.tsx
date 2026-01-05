import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../store/auth'
import api from '../lib/api'
import { getSocket } from '../lib/socket'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import Sidebar from '../components/Sidebar'
import { Video, X, LogOut, Users, MessageSquare } from 'lucide-react'

export default function AdminLivePage() {
  const auth = useAuth()
  const router = useRouter()
  const { sessionId } = router.query
  const [session, setSession] = useState<any>(null)
  const [viewers, setViewers] = useState<any[]>([])
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewerCount, setViewerCount] = useState(0)
  const [reactions, setReactions] = useState<any[]>([])
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const offerProcessedRef = useRef<boolean>(false)
  const [socket, setSocket] = useState<any>(null)
  const socketRef = useRef<any>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const stableSessionIdRef = useRef<string | null>(null)
  const rejoinIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const log = (location: string, message: string, data: any) => {
    // Debug logging disabled - uncomment to enable
    // #region agent log
    // fetch('http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location,message,data,timestamp:Date.now(),sessionId:'debug-session',runId:'admin-run',hypothesisId:'ADMIN'})}).catch(()=>{});
    // #endregion
    // Console logging for debugging (can be removed in production)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${location}] ${message}`, data)
    }
  }

  useEffect(() => {
    if (!auth.token || auth.user?.role !== 'ADMIN') {
      router.push('/login')
      return
    }

    if (!sessionId) return

    // Normalize and pin sessionId once to avoid router.query churn / array values.
    const normalizedSessionId =
      typeof sessionId === 'string' ? sessionId : Array.isArray(sessionId) ? sessionId[0] : ''
    if (!normalizedSessionId) return
    if (!stableSessionIdRef.current) {
      stableSessionIdRef.current = normalizedSessionId
      log('admin-panel/pages/live.tsx:session','pinned stable sessionId',{stableSessionId:stableSessionIdRef.current})
    } else if (stableSessionIdRef.current !== normalizedSessionId) {
      // If this ever happens, it explains offers/ICE mismatch. We pin anyway.
      log('admin-panel/pages/live.tsx:session','router sessionId changed after pin (ignored)',{stableSessionId:stableSessionIdRef.current,routerSessionId:normalizedSessionId})
    }

    // IMPORTANT ORDERING:
    // Connect socket + join_session FIRST so we can receive webrtc-offer immediately.
    // The admin join API can trigger `user_joined` -> broadcaster sends offer right away.
    const initializeFlow = async () => {
      try {
        const sock = initializeSocket()
        // Wait until socket joins session room before calling join API
        await new Promise<void>((resolve) => {
          if (!sock) return resolve()
          const onJoinedOnce = () => {
            sock.off('joined', onJoinedOnce)
            log('admin-panel/pages/live.tsx:init','socket joined session (pre-API join)',{stableSessionId:stableSessionIdRef.current})
            resolve()
          }
          sock.on('joined', onJoinedOnce)
          // if already connected, emit join immediately
          if (sock.connected) {
            sock.emit('join_session', { sessionId: stableSessionIdRef.current })
          }
        })

        await joinSessionAsAdmin()
        await loadSession()
      } catch (error) {
        console.error('Error in join flow:', error)
        setLoading(false)
      }
    }
    initializeFlow()

    return () => {
      log('admin-panel/pages/live.tsx:cleanup','cleanup called',{stableSessionId:stableSessionIdRef.current,hasSocketRef:!!socketRef.current,hasSocketState:!!socket,hasPc:!!pcRef.current})
      console.log('Admin live page cleanup - closing connections', {
        hasSocket: !!socket,
        hasPeerConnection: !!pcRef.current,
        sessionId
      })
      // Clear rejoin interval
      if (rejoinIntervalRef.current) {
        clearInterval(rejoinIntervalRef.current)
        rejoinIntervalRef.current = null
      }
      const s = socketRef.current || socket
      if (s) {
        console.log('Disconnecting socket')
        try {
          // Only disconnect if socket is actually connected to avoid warnings
          if (s.connected) {
          s.disconnect()
          }
        } catch (e: any) {
          log('admin-panel/pages/live.tsx:cleanup','socket disconnect failed',{error:e?.message})
        }
      }
      if (pcRef.current) {
        console.log('Closing peer connection in cleanup:', {
          signalingState: pcRef.current.signalingState,
          connectionState: pcRef.current.connectionState,
          iceConnectionState: pcRef.current.iceConnectionState
        })
        try {
          // Only close if not already closed
          if (pcRef.current.signalingState !== 'closed' && pcRef.current.connectionState !== 'closed') {
          pcRef.current.close()
          }
        } catch (e) {
          console.error('Error closing peer connection in cleanup:', e)
        }
        pcRef.current = null
      }
    }
  // NOTE: depending on `auth.user` can cause re-runs (and cleanups) during hydration/fast-refresh,
  // which can tear down the RTCPeerConnection while offers are in-flight.
  }, [sessionId, auth.token])

  // If tracks arrive before the video element is ready (or ref swaps),
  // re-attach the last known stream when possible.
  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      try {
        remoteVideoRef.current.srcObject = remoteStreamRef.current
        remoteVideoRef.current.muted = true
        remoteVideoRef.current.playsInline = true
        remoteVideoRef.current.autoplay = true
        log('admin-panel/pages/live.tsx:attach','re-attached remote stream to video element',{streamId:remoteStreamRef.current.id})
        
        // Play with retry - ignore AbortError (harmless interruption)
        const playVideo = async () => {
          if (remoteVideoRef.current) {
            try {
              const video = remoteVideoRef.current
              if (video.readyState >= 2) {
                await video.play()
              } else {
                video.addEventListener('loadeddata', async () => {
                  try {
                    if (remoteVideoRef.current) {
                      await remoteVideoRef.current.play()
                    }
                  } catch (err: any) {
                    // Ignore AbortError - harmless
                    if (err.name !== 'AbortError') {
          log('admin-panel/pages/live.tsx:attach','re-attach play failed',{error:err?.message,name:err?.name})
                    }
                  }
                }, { once: true })
              }
            } catch (err: any) {
              // Ignore AbortError - harmless interruption
              if (err.name !== 'AbortError') {
                log('admin-panel/pages/live.tsx:attach','re-attach play failed',{error:err?.message,name:err?.name})
              }
            }
          }
        }
        setTimeout(playVideo, 100)
      } catch (e: any) {
        log('admin-panel/pages/live.tsx:attach','re-attach failed',{error:e?.message})
      }
    }
  }, [status])

  async function joinSessionAsAdmin() {
    const sid = stableSessionIdRef.current
    if (!sid) return
    try {
      log('admin-panel/pages/live.tsx:api','join as admin',{stableSessionId:sid})
      await api.post(`/admin/sessions/${sid}/join`)
    } catch (error) {
      console.error('Failed to join session as admin:', error)
    }
  }

  async function loadSession() {
    const sid = stableSessionIdRef.current
    if (!sid) {
      setLoading(false)
      return
    }
    try {
      console.log('Loading session:', sid)
      log('admin-panel/pages/live.tsx:api','load session',{stableSessionId:sid})
      const { data } = await api.get(`/sessions/${sid}`)
      console.log('Session data received:', data)
      if (data.session) {
        setSession(data.session)
        // Backend returns viewers inside session object - filter out admins
        const allViewers = data.session.viewers || data.viewers || []
        const viewers = allViewers.filter((v: any) => !v.isAdmin && v.user?.id !== data.session.broadcaster?.id)
        setViewers(viewers)
        console.log('Loaded viewers:', { total: allViewers.length, filtered: viewers.length, allViewers: allViewers.map((v: any) => ({ username: v.user?.username, isAdmin: v.isAdmin })) })
        // Update viewer count from actual viewers list if socket hasn't provided it yet
        if (viewers.length > 0) {
        setViewerCount(viewers.length)
        }
      } else {
        console.error('No session data in response:', data)
      }
      setLoading(false)
    } catch (error: any) {
      console.error('Failed to load session:', error)
      console.error('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status
      })
      setLoading(false)
    }
  }

  function initializeSocket() {
    const sid = stableSessionIdRef.current
    if (!auth.token || !sid) return

    // Ensure token is properly formatted
    const token = auth.token.startsWith('Bearer') ? auth.token : `Bearer ${auth.token}`
    const sock = getSocket(token)
    
    // Remove old listeners to prevent duplicates
    sock.off('webrtc-offer')
    sock.off('webrtc-ice')
    sock.off('connect')
    sock.off('disconnect')
    sock.off('joined')
    sock.off('chat_message')
    sock.off('reaction')
    sock.off('user_joined')
    sock.off('user_left')
    sock.off('viewer_count')
    sock.off('session_ended')
    sock.off('disconnected')
    
    setSocket(sock)
    socketRef.current = sock
    log('admin-panel/pages/live.tsx:socket','socket initialized',{stableSessionId:sid,preConnected:!!sock.connected})

    // Helper function to register chat_message listener
    const registerChatListener = () => {
      console.log('[Admin] Registering chat_message listener for session:', sid, 'socket:', sock.id, 'connected:', sock.connected)
      // Remove old listener first to prevent duplicates
      sock.off('chat_message')
      sock.on('chat_message', (data: any) => {
        console.log('Admin received chat_message:', data)
        // Ensure we're in the right session
        if (data.sessionId === sid) {
          setChatMessages((prev) => {
            // Prevent duplicates by checking timestamp and message
            const exists = prev.some((msg: any) => 
              msg.userId === data.userId && 
              msg.message === data.message && 
              Math.abs(new Date(msg.timestamp).getTime() - new Date(data.timestamp).getTime()) < 1000
            )
            if (exists) {
              console.log('Duplicate chat message ignored:', data)
              return prev
            }
            return [...prev, data]
          })
        } else {
          console.log('Chat message for different session, ignoring:', data.sessionId, 'current:', sid)
        }
      })
    }

    sock.on('connect', () => {
      console.log('Admin socket connected, ID:', sock.id)
      log('admin-panel/pages/live.tsx:connect','admin socket connected',{socketId:sock.id,stableSessionId:sid})
      setStatus('connecting')
      // Set up WebRTC immediately when socket connects (before joining)
      // This ensures we're ready to receive offers from the broadcaster
      setupWebRTC(sock)
      
      // Register chat_message listener AFTER socket connects to ensure it's properly attached
      registerChatListener()
      
      // Emit immediately on connect (no artificial delays)
      console.log('Emitting join_session for admin, sessionId:', sid)
      log('admin-panel/pages/live.tsx:connect','admin emitting join_session',{stableSessionId:sid})
      sock.emit('join_session', { sessionId: sid })
    })

    sock.on('disconnect', () => {
      setStatus('disconnected')
    })

    sock.on('joined', () => {
      console.log('Joined session as admin')
      log('admin-panel/pages/live.tsx:joined','admin received joined',{stableSessionId:sid})
      // Ensure WebRTC is set up after joining
      setupWebRTC(sock)
      // Re-register chat listener after joining to ensure it's active
      registerChatListener()
      // Keep status as connecting until we receive video
    })

    // Periodically rejoin session room to ensure we stay in it
    // This prevents the socket from leaving the room due to reconnections or other issues
    rejoinIntervalRef.current = setInterval(() => {
      if (sock.connected && sid) {
        console.log('[Admin] Periodic rejoin session room:', sid)
        sock.emit('join_session', { sessionId: sid })
      }
    }, 5000) // Rejoin every 5 seconds to ensure we stay in the room

    // If socket is already connected, register chat listener immediately
    if (sock.connected) {
      registerChatListener()
    }

    // Listen for reactions
    sock.on('reaction', (data: any) => {
      const reactionId = Date.now() + Math.random()
      setReactions((prev) => [...prev, { ...data, id: reactionId }])
      // Remove reaction after 3 seconds
      setTimeout(() => {
        setReactions((prev) => prev.filter(r => r.id !== reactionId))
      }, 3000)
    })

    // Listen for user joins/leaves
    sock.on('user_joined', (data: any) => {
      console.log('Admin received user_joined:', data)
      loadSession() // Reload to get updated viewer list
    })

    sock.on('user_left', (data: any) => {
      loadSession() // Reload to get updated viewer list
    })

    // Listen for viewer count updates
    sock.on('viewer_count', (data: any) => {
      console.log('Admin received viewer_count:', data)
      if (data.sessionId === sid) {
      setViewerCount(data.count)
      }
    })

    // Listen for session ended
    sock.on('session_ended', () => {
      alert('Session has ended')
      router.push('/sessions')
    })

    sock.on('disconnected', (data: any) => {
      if (data.reason === 'SESSION_ENDED') {
        alert('Session has ended')
        router.push('/sessions')
      }
    })

    // Connect if not already connected
    if (!sock.connected) {
      sock.connect()
    } else {
      // Already connected, set up WebRTC and join immediately
      console.log('Socket already connected, setting up WebRTC and joining session immediately')
      setupWebRTC(sock)
      sock.emit('join_session', { sessionId: sid })
    }

    return sock
  }

  function setupWebRTC(sock: any) {
    const sid = stableSessionIdRef.current
    if (!sid) return

    console.log('Setting up WebRTC, current connection state:', {
      hasConnection: !!pcRef.current,
      signalingState: pcRef.current?.signalingState,
      connectionState: pcRef.current?.connectionState
    })
    log('admin-panel/pages/live.tsx:setupWebRTC','setupWebRTC called',{stableSessionId:sid,hasPc:!!pcRef.current,signalingState:pcRef.current?.signalingState,connectionState:pcRef.current?.connectionState})

    // Only create new connection if one doesn't exist or is closed
    if (!pcRef.current || pcRef.current.signalingState === 'closed' || pcRef.current.connectionState === 'closed') {
      // Close existing connection if any
      if (pcRef.current) {
        console.log('Closing existing connection before creating new one')
        try {
          pcRef.current.close()
        } catch (e) {
          console.error('Error closing old connection:', e)
        }
        pcRef.current = null
      }
      
      // Reset offer processed flag
      offerProcessedRef.current = false

      console.log('Creating new RTCPeerConnection')
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      })
      pcRef.current = pc
      console.log('New RTCPeerConnection created:', {
        signalingState: pc.signalingState,
        connectionState: pc.connectionState
      })
      // Ensure we explicitly receive media (important when we don't add local tracks)
      try {
        pc.addTransceiver('video', { direction: 'recvonly' })
        pc.addTransceiver('audio', { direction: 'recvonly' })
        log('admin-panel/pages/live.tsx:setupWebRTC','added recvonly transceivers',{stableSessionId:sid})
      } catch (e: any) {
        log('admin-panel/pages/live.tsx:setupWebRTC','failed to add transceivers',{stableSessionId:sid,error:e?.message})
      }
    } else {
      console.log('Reusing existing peer connection:', {
        signalingState: pcRef.current.signalingState,
        connectionState: pcRef.current.connectionState
      })
    }
    
    const pc = pcRef.current
    if (!pc) {
      console.error('Failed to get peer connection after setup')
      return
    }

    // Handle remote stream (broadcaster's video)
    pc.ontrack = (e) => {
      console.log('Admin received remote track:', {
        track: e.track,
        trackKind: e.track.kind,
        trackId: e.track.id,
        streamCount: e.streams.length,
        streamId: e.streams[0]?.id,
        videoElement: !!remoteVideoRef.current,
        videoElementReady: remoteVideoRef.current?.readyState
      })
      if (e.streams[0]) {
        const stream = e.streams[0]
        remoteStreamRef.current = stream
        console.log('Setting video stream to element:', {
          streamId: stream.id,
          trackCount: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length,
          videoElementId: remoteVideoRef.current?.id
        })
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream
          remoteVideoRef.current.muted = true
          remoteVideoRef.current.playsInline = true
          remoteVideoRef.current.autoplay = true
          log('admin-panel/pages/live.tsx:ontrack','set srcObject',{streamId:stream.id,videoTracks:stream.getVideoTracks().length,audioTracks:stream.getAudioTracks().length})
        } else {
          log('admin-panel/pages/live.tsx:ontrack','video element missing; cached stream',{streamId:stream.id})
        }
        console.log('Video stream set, checking element state:', {
          srcObject: !!remoteVideoRef.current?.srcObject,
          readyState: remoteVideoRef.current?.readyState,
          paused: remoteVideoRef.current?.paused,
          muted: remoteVideoRef.current?.muted,
          videoWidth: remoteVideoRef.current?.videoWidth,
          videoHeight: remoteVideoRef.current?.videoHeight,
          currentTime: remoteVideoRef.current?.currentTime,
          duration: remoteVideoRef.current?.duration,
          networkState: remoteVideoRef.current?.networkState,
          error: remoteVideoRef.current?.error
        })
        setStatus('connected')
        console.log('Video stream set, status updated to connected')
        
        // Force play immediately
        if (remoteVideoRef.current) {
          remoteVideoRef.current.play().then(() => {
            setIsVideoPlaying(true)
          }).catch(err => {
            console.log('Immediate play failed, will retry:', err.message)
          })
        }

        // Add user interaction to ensure video plays
        const ensureVideoPlays = () => {
          if (remoteVideoRef.current && remoteVideoRef.current.paused && remoteVideoRef.current.readyState >= 2) {
            remoteVideoRef.current.play().then(() => {
              setIsVideoPlaying(true)
            }).catch(err => {
              if (err.name !== 'AbortError') {
                console.log('Ensure play failed:', err.message)
              }
            })
          }
        }

        // Try to play on various events
        document.addEventListener('click', ensureVideoPlays, { once: true })
        document.addEventListener('touchstart', ensureVideoPlays, { once: true })

        // Force play with retry logic - wait for video to have enough data
        if (remoteVideoRef.current) {
          const playVideo = async () => {
            const video = remoteVideoRef.current
            if (!video) return
            
            try {
              // Wait for video to have metadata (readyState >= 1) or current data (readyState >= 2)
              const waitForReady = () => {
                return new Promise<void>((resolve) => {
                  if (video.readyState >= 1) {
                    resolve()
                    return
                  }
                  
                  const onLoadedMetadata = () => {
                    video.removeEventListener('loadedmetadata', onLoadedMetadata)
                    resolve()
                  }
                  video.addEventListener('loadedmetadata', onLoadedMetadata)
                  
                  // Timeout after 3 seconds
                  setTimeout(() => {
                    video.removeEventListener('loadedmetadata', onLoadedMetadata)
                    resolve()
                  }, 3000)
                })
              }
              
              await waitForReady()
              
              if (video.readyState >= 1) {
                // Video has metadata, try to play
                await video.play()
                console.log('Video element play() succeeded', { readyState: video.readyState })
                log('admin-panel/pages/live.tsx:ontrack','video play succeeded',{readyState:video.readyState})
                setIsVideoPlaying(true)
              } else {
                // Still not ready, wait for loadeddata
                video.addEventListener('loadeddata', async () => {
                  try {
                    if (remoteVideoRef.current) {
                      await remoteVideoRef.current.play()
                      console.log('Video element play() succeeded after loadeddata')
                      setIsVideoPlaying(true)
                    }
                  } catch (err: any) {
                    if (err.name !== 'AbortError') {
                      console.error('Video element play() failed after loadeddata:', err)
                    }
                  }
                }, { once: true })
              }
            } catch (err: any) {
              // Ignore AbortError - it's usually harmless (interrupted by new load)
              if (err.name !== 'AbortError') {
            console.error('Video element play() failed:', err)
            log('admin-panel/pages/live.tsx:ontrack','video play failed',{error:err?.message,name:err?.name})
              }
            }
          }
          // Small delay to ensure element is ready
          setTimeout(playVideo, 200)
        }
      } else {
        console.warn('Cannot set video stream:', {
          hasVideoElement: !!remoteVideoRef.current,
          hasStream: !!e.streams[0],
          streamCount: e.streams.length
        })
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('WebRTC connection state changed:', {
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState
      })
      if (pc.connectionState === 'connected' || pc.connectionState === 'connecting') {
        setStatus('connected')
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus('disconnected')
        console.warn('Connection disconnected or failed, state:', pc.connectionState)
      } else if (pc.connectionState === 'closed') {
        console.error('Connection closed unexpectedly!')
      }
    }
    
    // Handle signaling state changes
    pc.onsignalingstatechange = () => {
      console.log('WebRTC signaling state changed:', {
        signalingState: pc.signalingState,
        connectionState: pc.connectionState,
        hasLocalDescription: !!pc.localDescription,
        hasRemoteDescription: !!pc.remoteDescription
      })
      if (pc.signalingState === 'closed') {
        console.error('Signaling state is closed! This should not happen during active session.')
      }
    }
    
    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state changed:', {
        iceConnectionState: pc.iceConnectionState,
        connectionState: pc.connectionState
      })
      log('admin-panel/pages/live.tsx:ice','pc ice state change',{iceConnectionState:pc.iceConnectionState,connectionState:pc.connectionState,signalingState:pc.signalingState})
    }

    // Remove existing WebRTC listeners to prevent duplicates
    sock.off('webrtc-offer')
    sock.off('webrtc-ice')

    // Handle WebRTC offers from broadcaster
    // IMPORTANT: Set up listener BEFORE any async operations to ensure it's ready
    console.log('[Admin] Setting up webrtc-offer listener for session:', sid, 'socket connected:', sock.connected, 'socket id:', sock.id)
    
    // Set up listener immediately (synchronously)
    const onWebrtcOffer = async (data: any) => {
      console.log('[Admin] webrtc-offer event received (raw):', data)
      console.log('Admin received WebRTC offer:', data)
      log('admin-panel/pages/live.tsx:webrtc-offer','offer received',{stableSessionId:sid,dataSessionId:data.sessionId,hasOffer:!!data.offer,fromUserId:data.fromUserId})
      
      // Update stable session ID if it doesn't match (can happen on page refresh)
      if (data.sessionId && data.sessionId !== sid) {
        console.warn(`[Admin] Session ID mismatch: stable=${sid}, offer=${data.sessionId}. Updating stable session ID.`)
        stableSessionIdRef.current = data.sessionId
        const newSid = data.sessionId
        log('admin-panel/pages/live.tsx:webrtc-offer','session id updated',{oldStableSessionId:sid,newStableSessionId:newSid})
      }
      
      const currentSid = stableSessionIdRef.current || sid
      if (data.sessionId !== currentSid) {
        log('admin-panel/pages/live.tsx:webrtc-offer','offer ignored (session mismatch)',{stableSessionId:currentSid,dataSessionId:data.sessionId})
        return
      }
      if (data.offer) {
        // Get current peer connection
        const currentPc = pcRef.current
        if (!currentPc) {
          console.log('No peer connection available, ignoring offer')
          return
        }
        
        // Check if connection is closed
        if (currentPc.signalingState === 'closed' || currentPc.connectionState === 'closed') {
          console.error('Peer connection is closed when offer received!', {
            signalingState: currentPc.signalingState,
            connectionState: currentPc.connectionState,
            iceConnectionState: currentPc.iceConnectionState,
            hasLocalDescription: !!currentPc.localDescription,
            hasRemoteDescription: !!currentPc.remoteDescription
          })
          // Recreate connection
          try {
            currentPc.close()
          } catch (e) {
            console.error('Error closing closed connection:', e)
          }
          pcRef.current = null
          offerProcessedRef.current = false
          setupWebRTC(sock)
          return
        }
        
        // Check if already have remote description
        if (currentPc.remoteDescription) {
          console.log('Already have remote description, ignoring duplicate offer')
          return
        }
        
        // Check if offer is already being processed
        if (offerProcessedRef.current) {
          console.log('Offer already being processed, ignoring duplicate')
          return
        }
        
        try {
          console.log('Processing WebRTC offer, current state:', {
            signalingState: currentPc.signalingState,
            connectionState: currentPc.connectionState,
            hasLocalDescription: !!currentPc.localDescription,
            hasRemoteDescription: !!currentPc.remoteDescription
          })
          offerProcessedRef.current = true
          await currentPc.setRemoteDescription(new RTCSessionDescription(data.offer))
          console.log('Remote description set, new signaling state:', currentPc.signalingState)
          log('admin-panel/pages/live.tsx:webrtc-offer','remote description set',{signalingState:currentPc.signalingState})
          
          const answer = await currentPc.createAnswer()
          console.log('Answer created:', { type: answer.type, sdpLength: answer.sdp?.length })
          
          await currentPc.setLocalDescription(answer)
          console.log('Local description set, signaling state:', currentPc.signalingState)
          log('admin-panel/pages/live.tsx:webrtc-offer','local description set',{signalingState:currentPc.signalingState,answerType:answer.type})
          
          // Send answer back to broadcaster
          // Use fromUserId if available, otherwise use broadcaster ID from session
          const broadcasterId = data.fromUserId || session?.broadcaster?.id
          if (broadcasterId) {
            console.log('Sending WebRTC answer to broadcaster:', broadcasterId, {
              answerType: currentPc.localDescription?.type,
              signalingState: currentPc.signalingState
            })
            sock.emit('webrtc-answer', {
              sessionId: sid,
              to: `user:${broadcasterId}`,
              answer: currentPc.localDescription
            })
            log('admin-panel/pages/live.tsx:webrtc-answer','answer emitted',{to:`user:${broadcasterId}`,stableSessionId:sid})
          } else {
            console.error('No broadcaster ID available to send answer')
            log('admin-panel/pages/live.tsx:webrtc-answer','no broadcaster id to send answer',{stableSessionId:sid})
          }
        } catch (error: any) {
          console.error('Error handling WebRTC offer:', error, {
            name: error?.name,
            message: error?.message,
            stack: error?.stack,
            currentSignalingState: currentPc.signalingState,
            currentConnectionState: currentPc.connectionState
          })
          offerProcessedRef.current = false // Reset on error so we can retry
        }
      }
    }
    
    // CRITICAL: Register the webrtc-offer listener (this was missing!)
    sock.on('webrtc-offer', onWebrtcOffer)
    console.log('[Admin] webrtc-offer listener registered on socket:', sock.id, 'connected:', sock.connected)

    // Handle ICE candidates
    const iceCandidateQueue: RTCIceCandidate[] = []
    
    sock.on('webrtc-ice', async (data: any) => {
      log('admin-panel/pages/live.tsx:webrtc-ice','ice received',{stableSessionId:sid,dataSessionId:data?.sessionId,fromUserId:data?.fromUserId,hasCandidate:!!data?.candidate,hasPc:!!pcRef.current,signalingState:pcRef.current?.signalingState,hasRemoteDesc:!!pcRef.current?.remoteDescription})
      
      // Update stable session ID if it doesn't match (can happen on page refresh)
      if (data?.sessionId && data.sessionId !== sid) {
        console.warn(`[Admin] ICE Session ID mismatch: stable=${sid}, ice=${data.sessionId}. Updating stable session ID.`)
        stableSessionIdRef.current = data.sessionId
      }
      
      const currentSid = stableSessionIdRef.current || sid
      if (data?.sessionId && data.sessionId !== currentSid) {
        log('admin-panel/pages/live.tsx:webrtc-ice','ice ignored (session mismatch)',{stableSessionId:currentSid,dataSessionId:data?.sessionId})
        return
      }
      if (data.candidate) {
        const currentPc = pcRef.current
        if (!currentPc) {
          console.log('No peer connection available for ICE candidate')
          log('admin-panel/pages/live.tsx:webrtc-ice','no pc for ice',{stableSessionId:sid})
          return
        }
        if (currentPc.signalingState === 'closed' || currentPc.connectionState === 'closed') {
          log('admin-panel/pages/live.tsx:webrtc-ice','pc closed - ignoring ice',{signalingState:currentPc.signalingState,connectionState:currentPc.connectionState})
          return
        }
        
        try {
          const candidate = new RTCIceCandidate(data.candidate)
          if (currentPc.remoteDescription) {
            await currentPc.addIceCandidate(candidate)
            log('admin-panel/pages/live.tsx:webrtc-ice','ice added',{signalingState:currentPc.signalingState})
          } else {
            // Queue if remote description not set yet
            iceCandidateQueue.push(candidate)
            log('admin-panel/pages/live.tsx:webrtc-ice','ice queued (no remote desc)',{queueLen:iceCandidateQueue.length})
          }
        } catch (error) {
          console.error('Error adding ICE candidate:', error)
          log('admin-panel/pages/live.tsx:webrtc-ice','ice add failed',{error:(error as any)?.message,name:(error as any)?.name})
        }
      }
    })
    
    // Process queued ICE candidates when remote description is set
    const processQueuedCandidates = async () => {
      const currentPc = pcRef.current
      if (currentPc && currentPc.remoteDescription && iceCandidateQueue.length > 0) {
        for (const candidate of iceCandidateQueue) {
          try {
            await currentPc.addIceCandidate(candidate)
          } catch (error) {
            console.error('Error adding queued ICE candidate:', error)
          }
        }
        iceCandidateQueue.length = 0
      }
    }
    
    // Process queued candidates when remote description is set
    pc.addEventListener('signalingstatechange', () => {
      if (pc.signalingState === 'stable' && pc.remoteDescription) {
        processQueuedCandidates()
      }
    })

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const broadcasterId = session?.broadcaster?.id
        if (broadcasterId) {
          sock.emit('webrtc-ice', {
            sessionId: sid,
            to: `user:${broadcasterId}`,
            candidate: e.candidate
          })
        }
      }
    }
  }

  async function sendChatMessage() {
    const sid = stableSessionIdRef.current
    if (!chatInput.trim() || !socket || !sid) return

    try {
      socket.emit('chat_message', {
        sessionId: sid,
        message: chatInput.trim()
      })
      setChatInput('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  async function kickUser(userId: string) {
    const sid = stableSessionIdRef.current
    if (!sid) return
    if (!confirm('Are you sure you want to kick this user?')) return

    try {
      await api.post(`/admin/sessions/${sid}/kick/${userId}`, {
        reason: 'Kicked by admin moderator'
      })
      loadSession()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to kick user')
    }
  }

  async function endSession() {
    const sid = stableSessionIdRef.current
    if (!sid) return
    if (!confirm('Are you sure you want to end this live session?')) return

    try {
      await api.post(`/admin/sessions/${sid}/end`)
      alert('Session ended successfully')
      router.push('/sessions')
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to end session')
    }
  }

  async function leaveSession() {
    const sid = stableSessionIdRef.current
    if (socket && sid) {
      socket.emit('leave_session', { sessionId: sid })
      socket.disconnect()
    }
    if (pcRef.current) {
      pcRef.current.close()
    }
    router.push('/sessions')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="lg:ml-64 ml-0 px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Live Session - Moderator View</h2>
            <p className="text-sm text-gray-600">
              {session?.broadcaster?.username || (loading ? 'Loading…' : 'Unknown')} - {session?.isPrivate ? 'Private' : 'Public'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 flex items-center gap-2">
              <Users className="h-4 w-4" />
              {viewerCount} viewers
            </span>
            <Button variant="outline" onClick={leaveSession}>
              <LogOut className="h-4 w-4 mr-2" />
              Leave
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Video Area */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-0">
                <div
                  className="relative bg-black rounded-lg overflow-hidden aspect-video cursor-pointer"
                  onClick={() => {
                    if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                      remoteVideoRef.current.play().then(() => {
                        setIsVideoPlaying(true)
                      }).catch(err => {
                        console.log('Manual play failed:', err.message)
                      })
                    }
                  }}
                >
                  <video
                    ref={remoteVideoRef}
                    id="admin-remote-video"
                    autoPlay
                    playsInline
                    muted
                    controls={false}
                    className="w-full h-full object-cover"
                    style={{ backgroundColor: '#000' }}
                    onLoadedMetadata={() => {
                      console.log('Video metadata loaded')
                      if (remoteVideoRef.current) {
                        remoteVideoRef.current.play().then(() => {
                          setIsVideoPlaying(true)
                        }).catch(err => {
                          // Ignore AbortError - it's usually harmless
                          if (err.name !== 'AbortError') {
                          console.error('Auto-play failed, trying muted play:', err)
                          if (remoteVideoRef.current) {
                            remoteVideoRef.current.muted = true
                              remoteVideoRef.current.play().then(() => {
                                setIsVideoPlaying(true)
                              }).catch(e => {
                                if (e.name !== 'AbortError') {
                              console.error('Muted play also failed:', e)
                                }
                            })
                            }
                          }
                        })
                      }
                    }}
                    onCanPlay={() => {
                      console.log('Video can play')
                      if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                        remoteVideoRef.current.play().then(() => {
                          setIsVideoPlaying(true)
                        }).catch(err => {
                          // Ignore AbortError
                          if (err.name !== 'AbortError') {
                          console.error('Play on canPlay failed:', err)
                          }
                        })
                      }
                    }}
                    onPlay={() => {
                      console.log('Video started playing')
                      setIsVideoPlaying(true)
                    }}
                    onPause={() => {
                      console.log('Video paused')
                      setIsVideoPlaying(false)
                    }}
                    onError={(e) => {
                      console.error('Video element error:', e)
                    }}
                  />
                  {/* Reactions overlay */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {reactions.map((reaction) => (
                      <div
                        key={reaction.id}
                        className="absolute text-4xl animate-bounce"
                        style={{
                          left: `${reaction.x * 100}%`,
                          top: `${Math.random() * 80}%`,
                          animation: 'fadeOutUp 3s ease-out forwards'
                        }}
                      >
                        {reaction.emoji}
                      </div>
                    ))}
                  </div>
                  {(loading || !session || (status === 'connecting' && !remoteStreamRef.current)) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-10">
                      <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p>{!session && !loading ? 'Session not found' : 'Connecting to stream…'}</p>
                      </div>
                    </div>
                  )}
                  {status === 'disconnected' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-20">
                      <div className="text-white text-center">
                        <p>Disconnected from stream</p>
                      </div>
                    </div>
                  )}
                  {status === 'connected' && !isVideoPlaying && remoteStreamRef.current && (
                    <div 
                      className="absolute inset-0 flex items-center justify-center bg-black/50 z-20 cursor-pointer"
                      onClick={() => {
                        if (remoteVideoRef.current) {
                          remoteVideoRef.current.play().then(() => {
                            setIsVideoPlaying(true)
                          }).catch(err => {
                            console.error('Manual play failed:', err)
                          })
                        }
                      }}
                    >
                      <div className="text-white text-center">
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-2 mx-auto hover:bg-white/30 transition">
                          <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                        <p className="text-sm">Click to play video</p>
                      </div>
                    </div>
                  )}

                </div>
              </CardContent>
            </Card>

            {/* Session Info */}
            <Card>
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600">Rate</p>
                    <p className="font-semibold">{session ? `${Math.ceil(session.ratePerSecond * 60)} tokens/min` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Earnings</p>
                    <p className="font-semibold">{session ? `${session.totalEarnings || 0} tokens` : '—'}</p>
                  </div>
                  <Button variant="destructive" onClick={endSession}>
                    <X className="h-4 w-4 mr-2" />
                    End Session
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Users and Chat */}
          <div className="space-y-4">
            {/* Viewers List */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Viewers ({viewers.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {viewers.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No viewers</p>
                  ) : (
                    viewers.map((viewer) => (
                      <div
                        key={viewer.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center text-white text-sm font-semibold">
                            {viewer.user?.username?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{viewer.user?.username || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">
                              {Math.floor((viewer.consumedSeconds || 0) / 60)} min
                            </p>
                          </div>
                        </div>
                        {viewer.user?.id !== session.broadcaster?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => kickUser(viewer.user?.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Chat */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Chat
                </h3>
                <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No messages yet</p>
                  ) : (
                    chatMessages.map((msg: any, i: number) => (
                      <div key={i} className="text-sm">
                        <span className="font-semibold text-purple-600">
                          {msg.username || 'Viewer'}:
                        </span>
                        <span className="ml-2">{msg.message}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    className="flex-1 text-sm px-3 py-2 border rounded-md"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  />
                  <Button onClick={sendChatMessage} size="sm">
                    Send
                  </Button>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => socket?.emit('reaction', { sessionId, emoji: '❤️' })}
                    className="text-red-500"
                  >
                    ❤️
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => socket?.emit('reaction', { sessionId, emoji: '👍' })}
                  >
                    👍
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => socket?.emit('reaction', { sessionId, emoji: '🔥' })}
                    className="text-orange-500"
                  >
                    🔥
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => socket?.emit('reaction', { sessionId, emoji: '⭐' })}
                    className="text-yellow-500"
                  >
                    ⭐
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}



