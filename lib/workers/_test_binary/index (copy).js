//
// Kurunt Benchmark (binary) Schema
//
// Benchmark processing performance (binary schema) for Kurunt.
// Version: 0.2
// Author: Mark W. B. Ashcroft (mark [at] kurunt [dot] com)
// License: Apache 2.0.
//
// Copyright (c) 2013 Mark W. B. Ashcroft.
// Copyright (c) 2013 Kurunt.
//


var config 					= require("./config.json");							// config settings for this schema.
//var config 					= require("../../../config.json");
var fs					= require('fs');
var g 					= require("../functions.js");							// global functions for all schemas.
var util 					= require('util');




var jsoncarrier 				= require('./jsoncarrier');							// delineate message chunks by linefeed (LF).


var version 				= 0.2;
var sock 					= undefined;	
var sock_store 				= undefined;	
//var cp			 		= require('child_process');

var net 					= require('net');


var timer = function(){
	var start,
			end;
	

	return {
		start: function(){
			start = new Date().getTime();
		},
		stop: function(){
			end = new Date().getTime();
		},
		getTime: function(){
			return time = (end - start) / 1000;
		}
	};
}


var t = timer();
var timetaken 				= 0;
var benchmarking_starttime		= 0;



var loaded 					= false;

var i = 0;
var mps = 0;

var n = 0;


/*
// If zmq (ZeroMQ) available use, else use Axon.
try {
	var mq			= require('zmq');
	console.log('using ZMQ');
} catch(e) {
	var mq 			= require('axon');
	console.log('using AXON');
}
*/
var mq 			= require('axon');
var sock 			= mq.socket('push');


// expose functions.
exports._load = _load;
exports.schema = schema;


var cluster 	= require('cluster');
var numCPUs 	= require('os').cpus().length;
var nodeID 		= 'master#0';

var running_standalone = false;	// false = required as a module.
if ( require.main === module ) {
	console.log("called directly");
	running_standalone = true;
} else {
	console.log("required as a module");
}

// does this app run standalone or as a module?
if ( running_standalone === true ) { 

		

/*
	if (cluster.isMaster) {
		// Fork workers.
		for (var i = 0; i < numCPUs; i++) {
			console.log('FALK!');
			cluster.fork();
		}
		cluster.on('exit', function(worker, code, signal) {
			var exitCode = worker.process.exitCode;
			console.log('worker ' + worker.process.pid + ' died ('+exitCode+'). restarting...');
			cluster.fork();
		});
	} else {
		nodeID = 'worker#' + cluster.worker.id;
		console.log('I am worker #' + cluster.worker.id);	 // Worker.
	}
*/
	this._load(); 

}

var batched_msg = "";
//var config_batching_size = 524288;		// .5 MBs






// this function gets called when first process.on('message' is triggered, (must always have _load function).
function _load() {
	
	if ( running_standalone === true ) {
		// copyright statement.
		console.log('Welcome to Kurunt ' + config['title'] + ' Schema (http://kurunt.org).\nVersion '+version+' (Apache License 2.0).\n\nCopyright (c) 2013 Mark W. B. Ashcroft.\nCopyright (c) 2013 Kurunt.\n\nType ctrl+c to exit the program.\n>>>');
	} else {
		g.log('*Loading ' + config['title'] + ' Schema.', config);
	}


	// LogFormat JSON
	// SAMPLE: { "number" : 59201 }
	//
	// See Kurunt: 		http://docs.kurunt.com/schemas/benchmark_simple
	


	sock.connect('tcp://' + config['out_host'] + ':' + config['out_port']);
	console.log('benchmark> connected to store: ' + config['out_host'] + ':' + config['out_port']);


	// TODO need to have array of clients connected cause messages may come from many schemas!!!
	

		var messages = jsoncarrier.parse(config);
		messages.on('message',  function(message) {
			// message has entered as object, message.message contains recieved message contents.airline ratings

			//console.log('schema> got one message: ' + message + 'EOM');
			console.log('schemaDUMP> ' + util.inspect(message, true, 99, true));
			mps++;
			n++;

		try {

			schema(message, function(m) {
				console.log('schemaDUMPFIN> ' + util.inspect(m, true, 99, true));
				
					
				if ( m != false ) {
					//m['schemaed'] = true;
					//console.log('schemaFinDUMP> ' + util.inspect(message, true, 99, true));
					//_send(m);

				} else {
	
					console.log('err> ' + util.inspect(message, true, 99, true));
					console.log('err m> ' + util.inspect(m, true, 99, true));

					throw new Error('exception');
					var m = {};
					m.message = 'nada';

				}

				//console.log('schemaDUMPFIN> ' + util.inspect(m, true, 99, true));
				
				return true;

			});

		} catch (e) {
			console.log('error3: ' + e.message);
			throw new Error('exception');
		}


		});


	console.log(nodeID + '@benchmark> loaded');
	loaded = true; 


	setInterval(function () {		

		console.log(nodeID + '@benchmark> mps: ' + mps + ' n: ' + n);
		//console.log('BLAH!!!');	
		//process.send('benchmark> blah');
		mps = 0;		// reset
	}, 1000);


}



function _send(m) {
	_nagleish_batching(m,function() { 
		// garbage collector.
	});
	mps++;
	n++;
}


function _nagleish_batching(m, cb) {



	if ( config['mq_nodelay'] === true ) {
		//console.log('sending msg with mq_nodelay');
		sock.send(JSON.stringify(m) + "\n");
		cb(true);
		return true;
	}

	// This function applies a nagle-ish algorithm (http://en.wikipedia.org/wiki/Nagle's_algorithm) for batching messages before sending to 0MQ/Axon.
	// config['mq_nodelay'] = false, to apply this algorithm. When applyed speeds messages per seconds by 2 to 3 order of magnatude (~22k mps to ~90k mps).
	
	var expires = 200;				// Timeout period for sending remaining messages in miliseconds.
	var mss 	= 4288;				// Maximum Segment Size (http://en.wikipedia.org/wiki/Maximum_segment_size) in bytes (9760 bytes if IPv6).
	
	if ( batched_msg == "" ) {
		// start nagleish delay timmer.
		var nagleishTimeOut = (function () {
			setTimeout(function () {
				_nagleish_batching('',function() { 
					// garbage collector.
				});
			}, expires);
		})();	
	}

	if ( m != '' ) {
		batched_msg += JSON.stringify(m) + "\n";
	}

	var batched_size = Buffer.byteLength(batched_msg, config['encoding']);
	if ( batched_size > mss || m == '' && batched_size > 0 ) {
		clearTimeout(nagleishTimeOut);				// reset timer for timeout.
		var msg = batched_msg;
		batched_msg = "";							// reset.
		//console.log('mjson>' + msg + '<');
		sock.send(msg);
		/*
		if ( m == '' ) {
			console.log('send (batching) msg as TimedOut, bytes: ' + batched_size);
		} else {
			console.log('send (batching) msg bytes: ' + batched_size);
		}
		*/
	}


	// not filled yet, timeout in play.
	cb(true);
	return true;
	
}


process.on('message', function(msg) {
	//console.log('msg from ETL: ' + msg);
	if ( msg == 'load' && loaded === false ) {
	  	_load();
	}
});



function schema(message, callback) {

	if ( !config['encoding'] ) {
		config['encoding'] = 'utf8';
	}
	// first convert message from buffer to string (as i know this message is a string and not binary data).
	//message.message = message.message.toString(config['encoding']);

	message.name				= config['name'];
	message.encoding 				= config['encoding'];
	message.reports 				= config['reports'];
	message.stores				= config['stores'];
	
	var attributes_values 			= [];


// TESTING ---------
	console.log('message.message: ' + message.message.length);
	
	var mypic = message.message.toString('ascii');
			
	//var base64Image = mypic.toString('base64');
	var decodedImage = new Buffer(mypic, 'base64');
			
	console.log('mypiclen: ' + decodedImage.length);
	//console.log('mypic: ' + decodedImage);
	
	
	
	var path = '/tmp/' + (Math.random() * 0xffffff | 0) + '.jpeg';
	fs.writeFile(path, decodedImage, function(err){
		if (err) throw err;
		console.log('saved %s', path);
	});
	
	
	callback(true);
	return true;
// END TEST.

	message.message = message.message.toString(config['encoding']);

	// convert message to json.
	try {
		var message_json = JSON.parse(message.message);
		message.message = message_json;										  
	} catch(e) {
		callback(false);
		return false;
	}

	


	attributes_values['number']		= message["message"]["number"];

	// use now time in UTC (if system was not set to UTC).
	var now 					= new Date(); 
	var nowUTC 					= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),  now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
	var nowUTCUnix 				= Number(nowUTC / 1000);						// timestamp.
	attributes_values['time']		= nowUTCUnix;


	// for each stores schema attribute in config.json.
	for ( var s in config['stores'] ) {
		//console.log('store: ' + s + ' : ' + config['stores'][s]);
		for ( var i in config['stores'][s] ) {
			//console.log('i: ' + i + ' : ' + config['stores'][s][i]['schema']);
			for ( var a in config['stores'][s][i]['schema'] ) {
				//console.log('a: ' + a + ' : name ' + config['stores'][s][i]['schema'][a]['name'] + ' type ' + config['stores'][s][i]['schema'][a]['type'] );
				message.stores[s][i]['schema'][a].value 		= attributes_values[config['stores'][s][i]['schema'][a]['name']];
				message.stores[s][i]['schema'][a].id 		= -1;
			}
		}
	}	

	// null orgional message, as probably dont need to use it again.
	message.message = '';	

	//console.log('DUMP> ' + util.inspect(message, true, 99, true));
	//console.log('mjson>' + JSON.stringify(message) + '<');

	callback(message);
	return true;

}


