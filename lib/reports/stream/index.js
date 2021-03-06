//
// Kurunt Sream Report
//
// Sream Report
// Version: 0.2
// Author: Mark W. B. Ashcroft (mark [at] kurunt [dot] com)
// License: MIT or Apache 2.0.
//
// Copyright (c) 2013-2014 Mark W. B. Ashcroft.
// Copyright (c) 2013-2014 Kurunt.
//


// for web server.

var url 				= require("url");
var fs 					= require("fs");
var os 					= require('os');
var mime 				= require("mime");
var util 				= require("util");

var lconfig 		= require("./config.json");
exports.config 	= lconfig;		// must export the config so kurunt can read it.

var gconfig 		= require("../../.././config.json");



var logging 		= require('../.././logging');


var app					= require('http').createServer(handler);

var pname 			= 'stream@reports>';

var io 					= undefined;		// can check if socket.io is installed.
try {
	io = require('socket.io').listen(app, { log: false });
} catch(e) {
	logging.log(pname + ' You need to install socket.io. >npm install socket.io');
}


var host_address = gconfig['host'];

module.exports.init = function (processID) {

	if ( lconfig["discover_host"] ) {
		var http       = require("http");		// used to check if host_address is ec2.
		var ec2address = getEC2PublicAddress(http, function(address) {
			//console.log('----------\n');
			//console.log('ec2address: ' + address);
			if ( address === false ) {
				host_address = disvover_host();
			} else {
				host_address = address;
			}
		});
	}

	// only if socket.io is installed.
	if ( io != undefined ) {
	
		//var portSt = lconfig['port'].toString().substring(0, lconfig['port'].toString().length - 1) + processID.toString();
		var portSt = lconfig['port'] + Number(processID);

		var STREAM_REPORT_PORT = Number(portSt);
		logging.log('stream#' + processID + '@reports> opening webserver on port: ' + STREAM_REPORT_PORT);
		pname = 'stream#' + processID + '@reports>';
		app.listen(STREAM_REPORT_PORT);
	} else {
		logging.log('stream#' + processID + '@reports> not opening, socket.io not installed.');
	}
	
};



// web server handle browser requests, responses.
function handler(req, res) {

  var uri = url.parse(req.url).pathname;
  //var filename = path.join(process.cwd(), uri);
  var filename = '';
  
  if ( uri === '/' ) {
  	//filename = process.cwd() + '/lib/reports/stream/index.html';
  	filename = __dirname + '/index.html';
  } else {
  	//filename = process.cwd() + '/lib/reports/stream' + uri;
  	filename = __dirname + uri;
  }
  
  //console.log('stream@reports> uri: ' + uri);
  //console.log(pname + ' filename: ' + filename);

  // info requests.
  if ( uri === '/X-kurunt.info' ) {
    res.writeHead(200, 
    	{
      	"Content-Type": "application/plain",
      	"X-kurunt-admin-address": "http://"+gconfig['host']+":"+gconfig['admin_www_port']
    	}
    );
    res.end();
    return; 
  }

	// --- static web server, return static requested file or 404 ------------------------------------
  fs.exists(filename, function(exists) {
    if(!exists) {
    	//console.log(pname + ' 404 file');
      res.writeHead(404, {"Content-Type": "text/plain"});
      res.write("404 Not Found\n");
      res.end();
      return;
    }
 
	 	if ( fs.statSync(filename).isDirectory() ) {
			filename += '/index.html';
		}
 
    fs.readFile(filename, "binary", function(err, file) {
      if(err) {        
        res.writeHead(500, {"Content-Type": "text/plain"});
        res.write(err + "\n");
        res.end();
        return;
      }
 
			// web admin basic authentication (if set).
			if ( lconfig["www_auth"] ) {
				var auth = req.headers['authorization']||false;        			// get the auth header
				if ( !auth ) {
					res.writeHead(401, {'WWW-Authenticate': 'Basic realm="Kurunt Stream Report"', 'Content-Type': 'text/html', 'Connection': 'closed'});
					res.end('<html><head><title>Kurunt - Not valid authentication</title></head><body><h1>Not valid authentication.</h1></body></html>\n');
					return;					
				} else {
					var auth_token = auth.split(/\s+/).pop()||'',             // and the encoded auth token
					auth = new Buffer(auth_token, 'base64').toString(),     	// convert from base64
					auth_parts = auth.split(/:/),                           	// split on colon
					auth_username = auth_parts[0],                          	// coresponds to the data's apikey requesting.
					auth_password = auth_parts[1];                          	// match against lconfig['stream_api_pass'].							
					if ( ( auth_username === lconfig["www_auth_username"] ) && ( auth_password === lconfig["www_auth_password"] ) ) { 
						// auth ok...
					} else {
						res.writeHead(401, {'WWW-Authenticate': 'Basic realm="Kurunt Stream Report"', 'Content-Type': 'text/html', 'Connection': 'closed'});
						res.end('<html><head><title>Kurunt - Not valid authentication</title></head><body><h1>Not valid authentication.</h1></body></html>\n');
						return;					
					}
				}
			}
			
			// if is html file append any <kurunt-tag> tags.

			// kurunt tags map to replace with:
			var tags = {};		// all tags are proceeded by 'kurunt-';

			// set tags:
			tags['host-address'] = host_address;
			tags['admin-address'] = host_address+":"+gconfig['admin_www_port'];
			
			for ( var tag in tags ) {
				//console.log('tag: ' + tag + ' tags: ' + tags[tag]);
				var regex = new RegExp("<kurunt-"+tag+">", 'gm');		// gm sets replace all and over multi lines.
				file = file.replace(regex, tags[tag]);
			}
	 		
	 
      res.writeHead(200, 
      	{
      		"Content-Type": mime.lookup(filename)
      	}
      );
      res.write(file, "binary");
      res.end();
    });
  });
	// --- end static web server ---------------------------------------------------------------------
}



// NOTE: If using multiple workers within topology.json, then will recieve messages sequentially from each worker but not between workers.
// For example: may recieve the last message from worker 1 which has a lesser id then worker 0's last message, worker 1 finished slower than worker 0.

var MESSAGES_QUE_X = 20;		// how many (number) messages to queue, dont set too high as will overwhelm browser. 
var messages_que = [];			// array of the last messages recieved to send to browsers, then used in sly.
messages_que['all'] = [];


var mps = [];			// array for each stream.
mps['all'] = 0;		// set 'all' room/channel.
var tot = [];			// array for each stream.
tot['all'] = 0;		// set 'all' room/channel.

module.exports.message = function (message, callback) {
	//console.log('stream@reports, message> ', message);

	var room_name = message.worker.object.toString() + '_' + message.apikey.toString();		// need to match browser selected streams (room).

	// set report name "stream" within message.
  for ( var s in message.stores ) {
  	if ( typeof message.stores[s] === 'object' ) {
  		for ( var st in message.stores[s] ) {
  			if ( st === 'stream' ) {
					message.stores[s][st].report = 'stream';
  			}
  		}
  	} else {
			if ( message.stores[s].toString() === 'stream' ) {
				message.stores[s] = {};
				message.stores[s].stream = {}; 
				message.stores[s].stream.report = 'stream';
			}
  	}
  }

	// truncating message slows performance.
	if ( lconfig['truncate_message'] === true ) {
		
		// alternativly could use clone [var clone = require('clone')] as JSON wont pass Date etc. but JSON is faster.
		var msg = (JSON.parse(JSON.stringify(message)));
		//var msg = clone(message);
	
		// enqueue messages_que message, to maximum of MESSAGES_QUE_X.
		if ( messages_que.length >= MESSAGES_QUE_X ) {
			messages_que.splice(0, 1);		// remove first 'oldest' message item from array.
		}

		// go through each schema item and tuncate values to fit better in browser screen.
		for ( var s in message.stores ) {
			//console.log('s: ' + s + ' value: ' + message.stores[s]);
			for ( var st in message.stores[s] ) { 
				//console.log('st: ' + st + ' value: ' + message.stores[s][st]);
				if ( st === 'stream' ) {
					var dataObj = message.stores[s]['stream'];

					//console.log('stream> dataObj: ' + require('util').inspect(dataObj, true, 99, true));
				
					// schema items are a collection of objects, key = name of object.
					var schemaItems = Object.keys(dataObj['schema']);
	
					//console.log('stream@reports> schemaItems: ' + require('util').inspect(schemaItems, true, 99, true));
				
					schemaItems.forEach(function(item) {
						hasdata = true;
						//console.log('stream> attr: ' + require('util').inspect(dataObj['schema'][item], true, 99, true));
						
						//dataObj['schema'][item]['type']
	
						var value = dataObj['schema'][item]['value'];
					
						if ( value != undefined ) {
					
							value_json = JSON.stringify(value);
					
							if ( Buffer.byteLength(value_json, 'utf8') > 256 ) {
								// have to detect what type the value is: string, int, array, object, etc.
						
								//console.log('value type: ' + util.isArray(value) );
						
								if ( util.isArray(value) ) {
									value = value.slice(0, 9);
									value.push('...');
							
									// double check is still not too big
									value_json = JSON.stringify(value);
									if ( Buffer.byteLength(value_json, 'utf8') > 256 ) {
										value = [];
										value.push('...');
									}
								}
						
								// if Object ...
								if ( typeof value === 'object' ) {
									value = {};
									value['...'] = '...';
								}
						
								// if string ...
								if ( typeof value === 'string' ) {
									value = value.substring(0, 255) + '...';
								}
						
								// if integer ...
								if ( typeof value === 'number' ) {
									value = 0;
								}
						
							}

							msg.stores[s][st]['schema'][item].value = value;		// set the truncated value.
							
						}

					});		

				} else {
					// remove this store as not 'stream'.
					msg.stores[s][st] = '[truncated...]';
				}
			}
		}
		
		//console.log('stream@reports, msg> ' + util.inspect(msg, true, 99, true));	
		//console.log('stream@reports, message> ' + util.inspect(message, true, 99, true));	
		
		// enqueue messages_que message, to maximum of MESSAGES_QUE_X.
		if ( typeof messages_que[room_name] === 'undefined' ) {
			messages_que[room_name] = [];		// set fresh array for this room.
		}
		if ( messages_que[room_name].length >= MESSAGES_QUE_X ) {
			messages_que[room_name].splice(0, 1);		// remove first 'oldest' message item from array.
		}
		messages_que[room_name].push(msg);
		
		// set for 'all' room/stream.
		if ( messages_que['all'].length >= MESSAGES_QUE_X ) {
			messages_que['all'].splice(0, 1);		// remove first 'oldest' message item from array.
		}
		messages_que['all'].push(msg);
	
	} else {

		// if message has jpeg worker set jpeg_image.
		if ( message.worker.object === 'jpeg' ) {
			for ( var s in message.stores ) {
				//console.log('s: ' + s + ' value: ' + msgarray[i].stores[s]);
				for ( var st in message.stores[s] ) { 
					//console.log('st: ' + st + ' value: ' + msgarray[i].stores[s][st]);
					if ( st === 'stream' ) {
						var dataObj = message.stores[s]['stream'];
						var schemaItems = Object.keys(dataObj['schema']);
						schemaItems.forEach(function(item) {
							//console.log('item : ' + item);
							if ( item === 'jpeg_image' ) {
								// 1: convert js buffer array to node buffer.
								var value_buf = new Buffer(dataObj['schema'][item]['value']);
								// 2: is now origional base64, convert to string.
								var mypic = value_buf.toString('ascii');
								//console.log('SET PIC ' + mypic);
								message.stores[s][st]['schema'][item].value = mypic;
							}
						});
					}
				}
			}
		}

		// enqueue messages_que message, to maximum of MESSAGES_QUE_X.
		if ( typeof messages_que[room_name] === 'undefined' ) {
			messages_que[room_name] = [];		// set fresh array for this room.
		}
		if ( messages_que[room_name].length >= MESSAGES_QUE_X ) {
			messages_que[room_name].splice(0, 1);		// remove first 'oldest' message item from array.
		}
		messages_que[room_name].push(message);
		
		// set for 'all' room/stream.
		if ( messages_que['all'].length >= MESSAGES_QUE_X ) {
			messages_que['all'].splice(0, 1);		// remove first 'oldest' message item from array.
		}
		messages_que['all'].push(message);
		
	}	
	
	mps['all']++;
	tot['all']++;
	
	if ( typeof tot[room_name] === 'undefined' ) {
		tot[room_name] = 0;		// create new array item and set to start at 0.
	}
	tot[room_name]++;

	if ( typeof mps[room_name] === 'undefined' ) {
		mps[room_name] = 0;		// create new array item and set to start at 0.
	}
	mps[room_name]++;	
	
	return callback( true );
	
};




var timmer = undefined;

// only if socket.io is installed.
if ( io != undefined ) {

	// web sockets and kurunt messages.
	io.sockets.on('connection', function (socket) {

		// reset all mps rooms, even non active.
		for ( var h in mps ) {
			mps[h] = 0;	//reset.
		}

		socket.on('getStreams', function (x) {
    	//console.log('getStreams req: ' + x);
    	// TODO: need to get streams created as_modules not found within stream.json file.
    	try {
		 		// cant just require(stream) because it's cached not refreshed, so readFile.
				fs.readFile(__dirname + '/../../../streams.json', function (err, d) {
					//if (err) throw err;
					if (d.toString().trim() === '' ) {
						var streams = {'streams':[]};
					} else {
						var streams = JSON.parse(d.toString());
					}
					//console.log('streams> ' + util.inspect(streams, true, 99, true));
					socket.emit('streams', streams);
				});
			} catch(e) {
				//logging.log('streams.json error!');
				socket.emit('streams', streams);
			} 	
  	});

		socket.on('getStream', function (stream) {
			if ( stream === undefined ) {
				stream = 'all';
			}
    	//console.log('getStream req: ' + stream);
  		socket.set('stream', stream, function() { 
  			//console.log('stream ' + stream + ' saved'); 
  		} );
      socket.join(stream);
      

			// emit every second, tested raw every on.message emit, but this overwhelms browser.
			if (timmer === undefined ) {
				timmer = setInterval(function () {
			
					logging.benchmark('stream@reports> (all) mps: ' + mps['all'] + ' n: ' + tot['all']);

					// broadcast by each room (stream) connected.
					for ( var r in io.sockets.manager.rooms ) {
						
						if ( r != '' ) {
							var room = r.substring(1);
							//console.log('room name: ' + room);
							io.sockets.in(room).emit('ticker', tot[room], mps[room]);
							io.sockets.in(room).emit('messages', messages_que[room]);		
						}

					}

					
					// reset all mps rooms, even non active.
					for ( var h in mps ) {
						mps[h] = 0;	//reset.
					}
					
				}, 1000);
			}      


  	});


	});

}


function disvover_host() {
	// get this host ip other than local (127.0.0.1).
	var interfaces = os.networkInterfaces();
	for (k in interfaces) {
		for (k2 in interfaces[k]) {
			var address = interfaces[k][k2];
			if (address.family == 'IPv4' && !address.internal) {
				if ( address.address != '127.0.0.1' || address.address != 'localhost' ) {
					return address.address;
				}
			}
		}
	}
	return '127.0.0.1';
}

function getEC2PublicAddress(http, cb) {

	// looks up ec2 meta-data, if host not found (or timesout) then asumes this is not running on ec2.
	var lookedUp = false;

	var options = {
		hostname: '169.254.169.254',
		port: 80,
		path: '/latest/meta-data/public-hostname',
		method: 'GET'
	};

	var req = http.request(options, function(res) {
		res.setEncoding('utf8');
		res.on('data', function (address) {
		  //console.log('chunked address: ' + address);
			if ( !lookedUp ) {
				lookedUp = true;
				return cb( address );
			}
		});
	});

	req.on('error', function(e) {
		//console.log('problem with request: ' + e.message + ' lookedUp: ' + lookedUp);
		if ( !lookedUp ) {
			lookedUp = true;
			return cb( false );
		}
	});

	req.setTimeout(1000, function() {
		//console.log('EC2 address lookup timedout!');
		if ( !lookedUp ) {
			lookedUp = true;
			return cb( false );
		}
	});

	req.end();

}


