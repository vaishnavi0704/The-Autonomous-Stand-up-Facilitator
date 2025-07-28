import React, { useState, useEffect } from 'react';
import { AlertCircle, Users, Calendar, Clock, CheckCircle } from 'lucide-react';

const JoinMeetingPage = () => {
  const [name, setName] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch meeting info on component mount
  useEffect(() => {
    fetchMeetingInfo();
  }, []);

  const fetchMeetingInfo = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/meeting-info');
      const data = await response.json();
      setMeetingInfo(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch meeting info:', error);
      setIsLoading(false);
    }
  };

  const validateParticipant = async () => {
    if (!name.trim()) {
      alert('Please enter your name');
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch('http://localhost:5000/api/validate-participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      const result = await response.json();
      setValidationResult(result);
    } catch (error) {
      console.error('Validation failed:', error);
      alert('Failed to validate participant. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const joinMeeting = async () => {
    if (!validationResult?.valid) {
      await validateParticipant();
      return;
    }

    // Redirect to meeting room
    const participantName = validationResult.participant.name;
    const roomName = meetingInfo?.roomName || 'daily-standup-room';
    
    window.location.href = `/meeting?name=${encodeURIComponent(participantName)}&room=${roomName}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading meeting information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Meeting Status Card */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Daily Stand-up Meeting</h1>
            <p className="text-gray-600">Join NEHA AI for today's team standup</p>
          </div>

          {/* Meeting Status */}
          <div className="mb-6">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  meetingInfo?.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <span className="text-sm font-medium text-gray-700">
                  Meeting Status: {meetingInfo?.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <Clock className="w-4 h-4 text-gray-400" />
            </div>
            
            {meetingInfo?.agentActive && (
              <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-800">NEHA AI is ready and waiting</span>
                </div>
              </div>
            )}
          </div>

          {/* Name Input */}
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              onKeyPress={(e) => e.key === 'Enter' && joinMeeting()}
            />
          </div>

          {/* Validation Result */}
          {validationResult && (
            <div className={`mb-4 p-3 rounded-lg border ${
              validationResult.valid 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start space-x-2">
                {validationResult.valid ? (
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    validationResult.valid ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {validationResult.message}
                  </p>
                  {validationResult.valid && validationResult.participant && (
                    <div className="mt-2 text-sm text-gray-600">
                      {validationResult.participant.isReturning ? (
                        <div>
                          <p><strong>Project:</strong> {validationResult.participant.project || 'Not specified'}</p>
                          <p><strong>Role:</strong> {validationResult.participant.role || 'Not specified'}</p>
                        </div>
                      ) : (
                        <p>New team member - welcome to the team!</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Join Button */}
          <button
            onClick={joinMeeting}
            disabled={isValidating || !name.trim() || meetingInfo?.status !== 'active'}
            className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
              isValidating || !name.trim() || meetingInfo?.status !== 'active'
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isValidating ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Validating...</span>
              </div>
            ) : validationResult?.valid ? (
              'Join Meeting'
            ) : (
              'Validate & Join'
            )}
          </button>

          {meetingInfo?.status !== 'active' && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  Meeting is not currently active. Please wait for the host to start the meeting.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Meeting Info */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Meeting Details</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Room:</span>
              <span className="font-medium">{meetingInfo?.roomName || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">AI Assistant:</span>
              <span className="font-medium">NEHA (Scrum Master)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Meeting Type:</span>
              <span className="font-medium">Daily Stand-up</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinMeetingPage;