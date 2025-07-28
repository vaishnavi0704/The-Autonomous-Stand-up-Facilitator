import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Phone, 
  Settings, 
  Users,
  MessageSquare,
  Volume2,
  VolumeX
} from 'lucide-react';

const MeetingRoom = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');

  const roomRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});

  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const participantName = urlParams.get('name') || '';
  const roomName = urlParams.get('room') || 'daily-standup-room';

  useEffect(() => {
    if (!participantName || participantName.trim() === '') {
      setError('Participant name is required');
      return;
    }

    connectToRoom();

    return () => {
      disconnectFromRoom();
    };
  }, [participantName, roomName]);

  const connectToRoom = async () => {
    try {
      setIsConnecting(true);
      setConnectionStatus('Getting access token...');

      // Validate participant name
      if (!participantName || participantName.trim() === '') {
        throw new Error('Participant name is required');
      }

      // Get token from backend
      const tokenResponse = await fetch('http://localhost:5000/api/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: participantName.trim(),
          roomName: roomName,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get access token');
      }

      const tokenData = await tokenResponse.json();
      setConnectionStatus('Connecting to meeting room...');

      // Initialize LiveKit
      const { Room, RoomEvent, Track, RemoteTrack, RemoteTrackPublication } = await import('livekit-client');

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      roomRef.current = room;

      // Set up event listeners
      room.on(RoomEvent.Connected, () => {
        console.log('Connected to room');
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionStatus('Connected');
        setLocalParticipant(room.localParticipant);
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from room');
        setIsConnected(false);
        setConnectionStatus('Disconnected');
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('Participant connected:', participant.identity);
        setParticipants(prev => [...prev, participant]);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('Participant disconnected:', participant.identity);
        setParticipants(prev => prev.filter(p => p.identity !== participant.identity));
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('Track subscribed:', track.kind, participant.identity);
        
        if (track.kind === Track.Kind.Video) {
          const videoElement = document.createElement('video');
          videoElement.autoplay = true;
          videoElement.playsInline = true;
          videoElement.muted = true;
          track.attach(videoElement);
          
          // Store reference for cleanup
          remoteVideosRef.current[participant.identity] = videoElement;
          
          // Add to DOM
          const container = document.getElementById(`participant-${participant.identity}`);
          if (container) {
            container.appendChild(videoElement);
          }
        } else if (track.kind === Track.Kind.Audio) {
          const audioElement = document.createElement('audio');
          audioElement.autoplay = true;
          track.attach(audioElement);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log('Track unsubscribed:', track.kind, participant.identity);
        track.detach();
        
        if (remoteVideosRef.current[participant.identity]) {
          remoteVideosRef.current[participant.identity].remove();
          delete remoteVideosRef.current[participant.identity];
        }
      });

      // Connect to room
      await room.connect(tokenData.url, tokenData.token);

      // Enable camera and microphone
      await room.localParticipant.enableCameraAndMicrophone();

      // Attach local video
      if (localVideoRef.current && room.localParticipant.videoTracks.size > 0) {
        const videoTrack = Array.from(room.localParticipant.videoTracks.values())[0];
        videoTrack.track?.attach(localVideoRef.current);
      }

    } catch (err) {
      console.error('Failed to connect to room:', err);
      setError(err.message);
      setIsConnecting(false);
      setConnectionStatus('Connection failed');
    }
  };

  const disconnectFromRoom = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
  };

  const toggleAudio = async () => {
    if (!roomRef.current) return;

    try {
      if (isAudioEnabled) {
        await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      } else {
        await roomRef.current.localParticipant.setMicrophoneEnabled(true);
      }
      setIsAudioEnabled(!isAudioEnabled);
    } catch (err) {
      console.error('Failed to toggle audio:', err);
    }
  };

  const toggleVideo = async () => {
    if (!roomRef.current) return;

    try {
      if (isVideoEnabled) {
        await roomRef.current.localParticipant.setCameraEnabled(false);
      } else {
        await roomRef.current.localParticipant.setCameraEnabled(true);
      }
      setIsVideoEnabled(!isVideoEnabled);
    } catch (err) {
      console.error('Failed to toggle video:', err);
    }
  };

  const toggleSpeaker = () => {
    setIsSpeakerEnabled(!isSpeakerEnabled);
    // Mute/unmute all audio elements
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
      audio.muted = isSpeakerEnabled;
    });
  };

  const leaveRoom = () => {
    disconnectFromRoom();
    window.location.href = '/';
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connection Error</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Back to Join Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white font-semibold">Daily Stand-up Meeting</h1>
              <p className="text-gray-400 text-sm">
                {isConnected ? `Connected as ${participantName || 'Unknown'}` : connectionStatus}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
              isConnected 
                ? 'bg-green-100 text-green-800' 
                : isConnecting 
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : isConnecting ? 'bg-yellow-500' : 'bg-red-500'
              }`}></div>
              <span>{isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Video Grid */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
            {/* Local Participant */}
            <div className="bg-gray-800 rounded-lg overflow-hidden relative">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                {participantName || 'Unknown'} (You)
                {!isVideoEnabled && (
                  <div className="absolute inset-0 bg-gray-700 flex items-center justify-center">
                    <VideoOff className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>
            </div>

            {/* Remote Participants */}
            {participants.map((participant) => (
              <div key={participant.identity} className="bg-gray-800 rounded-lg overflow-hidden relative">
                <div 
                  id={`participant-${participant.identity}`}
                  className="w-full h-full flex items-center justify-center"
                >
                  <div className="text-white text-center">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">{participant.identity}</p>
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  {participant.identity || 'Unknown Participant'}
                  {participant.identity && participant.identity.includes('neha') && (
                    <span className="ml-1 text-xs bg-indigo-600 px-1 rounded">AI</span>
                  )}
                </div>
              </div>
            ))}

            {/* NEHA AI Placeholder if not connected */}
            {!participants.some(p => p.identity.includes('neha')) && (
              <div className="bg-gray-800 rounded-lg overflow-hidden relative">
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-white text-center">
                    <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Users className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-sm">NEHA AI</p>
                    <p className="text-xs text-gray-400">Scrum Master</p>
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  NEHA AI <span className="ml-1 text-xs bg-indigo-600 px-1 rounded">AI</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Participants List */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
          <h3 className="text-white font-semibold mb-4">Participants ({participants.length + 1})</h3>
          <div className="space-y-2">
            {/* Local participant */}
            <div className="flex items-center space-x-3 p-2 bg-gray-700 rounded">
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {participantName && participantName.length > 0 ? participantName.charAt(0).toUpperCase() : 'U'}
                </span>
              </div>
              <span className="text-white text-sm">{participantName || 'Unknown'} (You)</span>
            </div>

            {/* Remote participants */}
            {participants.map((participant) => (
              <div key={participant.identity} className="flex items-center space-x-3 p-2 bg-gray-700 rounded">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  participant.identity && participant.identity.includes('neha') ? 'bg-indigo-600' : 'bg-gray-600'
                }`}>
                  <span className="text-white text-sm font-semibold">
                    {participant.identity && participant.identity.length > 0 ? participant.identity.charAt(0).toUpperCase() : 'P'}
                  </span>
                </div>
                <span className="text-white text-sm">
                  {participant.identity || 'Unknown Participant'}
                  {participant.identity && participant.identity.includes('neha') && (
                    <span className="ml-1 text-xs text-indigo-400">AI Assistant</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-800 border-t border-gray-700 p-4">
        <div className="flex items-center justify-center space-x-4">
          {/* Audio Control */}
          <button
            onClick={toggleAudio}
            className={`p-3 rounded-full transition-colors ${
              isAudioEnabled 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Video Control */}
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full transition-colors ${
              isVideoEnabled 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* Speaker Control */}
          <button
            onClick={toggleSpeaker}
            className={`p-3 rounded-full transition-colors ${
              isSpeakerEnabled 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isSpeakerEnabled ? 'Mute speaker' : 'Unmute speaker'}
          >
            {isSpeakerEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Leave Meeting */}
          <button
            onClick={leaveRoom}
            className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors"
            title="Leave meeting"
          >
            <Phone className="w-5 h-5 transform rotate-135" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetingRoom;