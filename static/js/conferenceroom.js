/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 */

var ws = new WebSocket('ws://' + location.host + '/groupcall');
var participants = {};
var name,room;


window.onbeforeunload = function() {
	ws.close();
};

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'existingParticipants': // 2 done
		onExistingParticipants(parsedMessage);
		break;
	case 'newParticipantArrived': // 1 done
		onNewParticipant(parsedMessage);
		break;
	case 'participantLeft': // 4 
		onParticipantLeft(parsedMessage);
		break;
	case 'receiveVideoAnswer': // 3 done 
		receiveVideoResponse(parsedMessage);
		break;

	default:
		console.error('Unrecognized message', parsedMessage);
	}
};

function register() {

	if(document.getElementById('room').value == ''){
		window.alert("You must specify the room name");
		return;
	}	

	name = document.getElementById('name').value;

	if(document.getElementById('name').value == ''){
		window.alert("You must specify the display name");
		return;
	}	

	room = document.getElementById('room').value;

	document.getElementById('room-header').innerText = 'ROOM ' + room;
	document.getElementById('register').style.display = 'none';
	document.getElementById('video').style.display = 'block';

	var message = {
		id : 'joinRoom',
		name : name,
		room : room,
	};
	sendMessage(message);
}

function onNewParticipant(request) { // 1
	receiveVideo(request.name);
}

function receiveVideoResponse(result) {
	console.log("receiveVideoResponse:"+result.name);
	participants[result.name].rtcPeer.processSdpAnswer(result.sdpAnswer);
}

function callResponse(message) {
	if (message.response != 'accepted') {
		console.info('Call not accepted by peer. Closing call');
		stop();
	} else {
		webRtcPeer.processSdpAnswer(message.sdpAnswer);
	}
}
var audioSource = "",videoSource = "";
function gotSources(sourceInfos) {
  for (var i = 0; i !== sourceInfos.length; ++i) {
    var sourceInfo = sourceInfos[i];
    //var option = document.createElement('option');
    //option.value = sourceInfo.id;
    if (sourceInfo.kind === 'audio') {
      //option.text = sourceInfo.label || 'microphone ' + (audioSelect.length + 1);
      audioSource = sourceInfo.id;
      console.log("mic:"+sourceInfo.id);
      //audioSelect.appendChild(option);
    } else if (sourceInfo.kind === 'video') {
      videoSource = sourceInfo.id;
      //option.text = sourceInfo.label || 'camera ' + (videoSelect.length + 1);
      //videoSelect.appendChild(option);
    } else {
      console.log('Some other kind of source: ', sourceInfo);
    }
  }
}

if (typeof MediaStreamTrack === 'undefined'){
  alert('This browser does not support MediaStreamTrack.\n\nTry Chrome Canary.');
} else {
  MediaStreamTrack.getSources(gotSources);
}


//2
function onExistingParticipants(msg) {
var constraints = {
    audio: {
      optional: [
        {googEchoCancellation:true},
        {googAutoGainControl:true}, 
        {googNoiseSuppression:true},
        {googHighpassFilter:true}, 
        {googAudioMirroring:false}, 
        {googNoiseSuppression2:true}, 
        {googEchoCancellation2:true}, 
        {googAutoGainControl2:true}, 
        {googDucking:false}, 
        {sourceId:audioSource}, 
        {chromeRenderToAssociatedSink:true}
      ]
    },
    video: {
      optional: [
      	{sourceId: videoSource},
      	{googNoiseReduction: true},
      	{googLeakyBucket: true},
      	{minWidth: 160},
      	{maxWidth: 160},
      	{minHeight: 120},
      	{maxHeight: 120},
      	{minFrameRate: 15},
      	{maxFrameRate: 15}
      ]
    }
  };

	console.log(name + " registered in room " + room);
	var participant = new Participant(name,"send",room);
	participants[name] = participant;
	var video = participant.getVideoElement();
	participant.rtcPeer = kurentoUtils.WebRtcPeer.startSendOnly(video,
			participant.offerToReceiveVideo.bind(participant), null,
			constraints);
	
	msg.data.forEach(receiveVideo);
}

function leaveRoom() {
	sendMessage({
		id : 'leaveRoom',
		name: name,
		room: room
	});

	for ( var key in participants) {
		if(participants[key].rtcPeer){
			participants[key].dispose();
			delete participants[key];
		}
	}

        participants = [];
	name = '';
	room = '';
	document.getElementById('name').value = '';
	document.getElementById('room').value = '';

	document.getElementById('room-header').innerText = '';
	document.getElementById('register').style.display = 'block';
	document.getElementById('video').style.display = 'none';

}

function receiveVideo(sender) {
	console.log("receiveVideo:"+sender);
	var participant = new Participant(sender,"receive",room);
	participants[sender] = participant;
	var video = participant.getVideoElement();
	participant.rtcPeer = kurentoUtils.WebRtcPeer.startRecvOnly(video,
			participant.offerToReceiveVideo.bind(participant));
}

function onParticipantLeft(request) {
	console.log('Participant ' + request.name + ' left');
	var participant = participants[request.name];
	participant.dispose();
	delete participants[request.name];
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Senging message: ' + jsonMessage);
	ws.send(jsonMessage);
}
