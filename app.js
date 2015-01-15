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

var kurento = require('kurento-client');
var express = require('express');
var app = express();
var path = require('path');
var wsm = require('ws');

app.set('port', process.env.PORT || 8080);

/*
 * Definition of constants
 */

const
ws_uri = "ws://localhost:8888/kurento";

/*
 * Definition of global variables.
 */

var idCounter = 0;
var master = null;
//var pipeline = null;
var viewers = {};
var kurentoClient = null;
var roomlist = {};
var userRegistry = new UserRegistry();
var registry = {};
var incomingMedia = {};


function nextUniqueId() {
	idCounter++;
	return idCounter.toString();
}
/*
 * Server startup
 */

var port = app.get('port');
var server = app.listen(port, function() {
	console.log('Express server started ');
	console.log('Connect to http://<host_name>:' + port + '/');
});

var WebSocketServer = wsm.Server, wss = new WebSocketServer({
	server : server,
	path : '/groupcall'
});

/*
 * Definition of helper classes
 * */



//Represents caller and callee sessions

function UserSession(name, roomName, ws){
	this.displayName = name;
	this.ws = ws;
	this.roomName = roomName;
//	this.webRtcEndpoint = endpoint;
}

UserSession.prototype.sendMessage = function(message){
	console.log("sending message");
	this.ws.send(JSON.stringify(message));
}



//Represents registrar of users
function UserRegistry(){
	this.userInfo = {};
}

UserRegistry.prototype.register = function(user){
	this.userInfo[user.displayName] = user;
}

UserRegistry.prototype.getParticipants = function(user,roomName){
	var list = [];
	for(var key in this.userInfo){
		if(key != user && this.userInfo[key].roomName == roomName) list.push(key);
	}
    return list;
}

UserRegistry.prototype.newParticipantArrived = function(user,roomName){
	for(var key in this.userInfo){
		if(key != user && this.userInfo[key].roomName == roomName){
			var userSession = this.userInfo[key];
			userSession.ws.send(JSON.stringify({
				id: "newParticipantArrived",
				name: user,
                room: roomName
			}));			
		}
	}
}

UserRegistry.prototype.participantLeft = function(user,room){
	var participantCount = 0;
	for(var key in this.userInfo){
		if(this.userInfo[key] && key != user){
			var userSession = this.userInfo[key];
			userSession.ws.send(JSON.stringify({
				id: "participantLeft",
				name: user
			}));

			if(userSession.roomName == room)
				participantCount++;
		}
	}

	if(participantCount==0){
		roomlist[room].release();
		delete roomlist[room];
	}

}

/*
 * Management of WebSocket messages
 */
wss.on('connection', function(ws) {

	ws.on('error', function(error) {
		//console.log('Connection ' + sessionId + ' error');
		//stop(sessionId);
	});

	ws.on('close', function() {
		//console.log('Connection ' + sessionId + ' closed');
		//stop(sessionId);
	});


	ws.on('message', function(_message) {
		var message = JSON.parse(_message);
		
		console.log('Connection received message ', message);

		switch (message.id) {
		case 'joinRoom': 
				joinRoom(message,ws);
			break;
        
        case 'inviteRoom':
                inviteRoom(message, ws);
            break;
            
        case 'inviteResponse':
                inviteResponse(message, ws);
            break;

		case 'receiveVideoFrom': 
				receiveVideoFrom(message,ws);
			break;

		case 'leaveRoom': 
				leaveRoom(message,ws);
			break;



		default:
			ws.send(JSON.stringify({
				id : 'error',
				message : 'Invalid message ' + message
			}));
			break;
		}
	});
});

/*
 * Definition of functions
 */

function leaveRoom(data,ws) {
	var displayName = data.name;
	var roomName = data.room;
	var keyName = roomName+":"+displayName;
	
//	if(incomingMedia[keyName]) {
//		incomingMedia[keyName].release();
//		delete incomingMedia[keyName];
//	}


	userRegistry.userInfo[displayName].webRtcEndpoint.release();	
	delete userRegistry.userInfo[displayName];

	// broadcast participants left & check room 
	userRegistry.participantLeft(displayName,roomName);


}

// Sends an invite message to the participants of
// a certain room

function inviteRoom(data, ws) {
    var user = data.from;           
    var roomName = data.room;
    var participants = userRegistry.getParticipants(user,roomName);
    participants.forEach(function(participant) {
       var userInfo = userRegistry.userInfo[participant];
       userInfo.ws.send(JSON.stringify({
           id: 'incomingInvite',
           from: user,
           room: roomName
       }));
    });
}

// Sends a message back to the inviter whether
// the participants accepted or rejected
// the invite

function inviteResponse(data, ws) {
    var inviter = data.from;
    var invitee = data.to;
    var roomName = data.room;
    var response = data.response;
    var inviterInfo = userRegistry.userInfo[inviter];
    
    inviterInfo.ws.send(JSON.stringify({
        id: 'inviteResponse',
        response: response,
        to: invitee,
        room: roomName
    }));
}

function receiveVideoFrom(data,ws) {
   var sdpOffer = data.sdpOffer;
   var displayName = data.sender;
   var roomName = data.room;//userRegistry.userInfo[displayName].roomName;
   var keyName = roomName+":"+displayName;
   var outgoingMedia = userRegistry.userInfo[displayName].webRtcEndpoint;

   console.log("action:"+data.action);

   if(data.action == "send") {
   		// send
		outgoingMedia.processOffer(sdpOffer, function(error, sdpAnswer) {

			//sdpAnswer = setBandWidth(sdpAnswer);		


			ws.send(JSON.stringify({
				id:"receiveVideoAnswer",
				name: displayName,
				sdpAnswer: sdpAnswer
			}));
			
		});   		

   } else {
   		// received
  // 		  var incoming = incomingMedia[keyName];
	   	//var outgoingMedia = userRegistry.userInfo[displayName].webRtcEndpoint;
   		
/*
   		if(incoming){
				incoming.processOffer(sdpOffer, function(error, sdpAnswer) {
					//sdpAnswer = setBandWidth(sdpAnswer);
					ws.send(JSON.stringify({
						id:"receiveVideoAnswer",
						name: displayName,
						sdpAnswer: sdpAnswer
					}));
				});   			
   		}else {
*/
   			var pipeline = roomlist[roomName];
			pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {

				webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
					//sdpAnswer = setBandWidth(sdpAnswer);
					incomingMedia[keyName] = webRtcEndpoint;

					outgoingMedia.connect(webRtcEndpoint, function(error) {
						if (error) {
							stop(id);
							getState4Client();
						}

						ws.send(JSON.stringify({
							id:"receiveVideoAnswer",
							name: displayName,
							sdpAnswer: sdpAnswer
						}));
					});
				});
			});   			
  // 		}
 		
   }
   
   	



}


function joinRoom(data,ws) {
   
   var roomName = data.room;
   var displayName = data.name;	

    
   if(roomlist[roomName] == null){
   		// room owner
		getKurentoClient(function(error, kurentoClient) {


			kurentoClient.create('MediaPipeline', function(error, pipeline) {

                roomlist[roomName] = pipeline;
                userRegistry.register(new UserSession(displayName,roomName,ws));
                ws.send(JSON.stringify({
					id:"joinResponse",
                    response: "accepted",
                    room: roomName
				}));
				//pipeline = _pipeline;
//				pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
//
//					roomlist[roomName] = pipeline;				
//
//					userRegistry.register(new UserSession(displayName,roomName,ws, webRtcEndpoint));
//
//					var participants = userRegistry.getParticipants(displayName,roomName); 
//					console.log("New Room: "+JSON.stringify(participants));
//					ws.send(JSON.stringify({
//						id:"joinResponse",
//                        response: "accepted",
//                        room: roomName
//					}));
//
//				});
			});
		});
   } else {
   		// member
   	    var pipeline = roomlist[roomName];
        
        userRegistry.register(new UserSession(displayName,roomName,ws));

		//broadcast new member to all
		userRegistry.newParticipantArrived(displayName,roomName);
			
		var participants = userRegistry.getParticipants(displayName,roomName); 
        
		console.log("Join Room: "+JSON.stringify(participants));
        
		ws.send(JSON.stringify({
			id:"joinResponse",
            response: "accepted",
            room: roomName
		}));
   }
   
}

function removeReceiver(id) {
	if (!receivers[id]) {
		return;
	}
	var receiver = receivers[id];
	receiver.webRtcEndpoint.release();
	delete receiver[id];
}

function removeSender() {
	if (sender === null) {
		return;
	}

	for ( var ix in receivers) {
		removeReceiver(ix);
	}

	sender.webRtcEndpoint.release();
	sender = null;
}

function stop(id, ws) {
	if (master !== null && master.id == id) {
		for ( var ix in viewers) {
			var viewer = viewers[ix];
			if (viewer.ws) {
				viewer.ws.send(JSON.stringify({
					id : 'stopCommunication'
				}));
			}
		}
		viewers = {};
		pipeline.release();
		pipeline = null;
		master = null;
	} else if (viewers[id]) {
		var viewer = viewers[id];
		if (viewer.webRtcEndpoint)
			viewer.webRtcEndpoint.release();
		delete viewers[id];
	}
}


// Recover kurentoClient for the first time.
function getKurentoClient(callback) {
	if (kurentoClient !== null) {
		return callback(null, kurentoClient);
	}

	kurento(ws_uri, function(error, _kurentoClient) {
		if (error) {
			console.log("Coult not find media server at address " + ws_uri);
			return callback("Could not find media server at address" + ws_uri
					+ ". Exiting with error " + error);
		}

		kurentoClient = _kurentoClient;
		callback(null, kurentoClient);
	});
}

function setBandWidth(sdp){
	//console.log("need to modify sdp:"+JSON.stringify(sdp));
	//sdp = sdp.replace(/a=TestSession/g,'a=-');
	//a=x-google-flag:conference
	sdp = sdp.replace(/a=rtcp-mux\r\n/g,'a=rtcp-mux\r\na=x-google-flag:conference\r\n');
	// sdp = sdp.replace(/a=mid:audio\r\n/g, 'a=min:audio\r\nb=AS:40\r\n');
	sdp = sdp.replace(/a=rtpmap:100 VP8\/90000\r\n/g, 'a=rtpmap:100 VP8/90000\r\na=fmtp:100 width=160\r\na=fmtp:100 height=120\r\na=fmtp:100 framerate=30\r\n');
	return sdp;
}

app.use(express.static(path.join(__dirname, 'static')));
