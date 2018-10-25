var EventEmitter = EventEmitter = require('events').EventEmitter;
var http = require('http');
var http_server;
if (process.iotjs) {
    http_server = require('http_server');
} else {
    http_server = require('_http_server');
    http_server.connectionListener = http_server._connectionListener;
}
var net = require('net');

var util = require('util');


function ReverseHTTPServer(options, request_callback) {
    EventEmitter.call(this);
    var server = this;
    this.timeout = 30 * 1000;
    this._connectionLimit = 10;
    this._connectionsList = []
    this._socketCounter = 1;
    this._shouldOpenNew = false;

    if (util.isFunction(options)) {
        this._request_callback = options;
    } else {
        this._shouldOpenNew = options.shouldOpenNew;
        this._connectionLimit = options.connectionLimit;
        this._request_callback = request_callback;
        this._options = options;
    }

    this._transport = require((options.useSSL === true) ? 'tls' : 'net');

    this.on('request', function(request, response) {
        server._request_callback(request, response);
        if (server._shouldOpenNew && !response.finished) {
            response.end();
        }
    });
    this.on('clientClose', function(socket) {
        if (this._shouldOpenNew) {
            this._createSockets(1);
        }
    });
    this.on('clientError', function(socket) {
        this._shouldOpenNew = false;
    });

    if (!process.iotjs) {
        this[http_server.kIncomingMessage] = http.IncommingMessage;
        this[http_server.kServerResponse] = http.ServerResponse;
    }
};

// Server inherits EventEmitter.
util.inherits(ReverseHTTPServer, EventEmitter);

ReverseHTTPServer.prototype._emitCloseIfDrained = net.Server.prototype._emitCloseIfDrained;

ReverseHTTPServer.prototype.requestTunnel = function(server_url, callback) {
    var server = this;
    var srv;
    var port;
    var parts = server_url.split('//');
    var protocol = parts[0];

    if (protocol === 'https:') {
        srv = require('https');
        port = 443;
    } else if (protocol === 'http:') {
        srv = http;
        port = 80;
    } else {
        throw new Error("Incorrect server url: " + server_url);
    }

    var port_start = parts[1].indexOf(':');

    if (port_start !== -1) {
        port = parseInt(parts[1].substr(port_start + 1));
    }

    var tunnel_domain = parts[1].substr(0, port_start);

    if (callback) {
        server.on('tunnelConnected', callback);
    }
    var get_options = {
        port: port,
        host: tunnel_domain,
        path: '/api/new',

        ca: server._options.ca,
    };

    var get = srv.get(get_options, function(response) {
        var data = []
        response.on('data', function(chunk) {
            console.log(chunk.toString());
            data.push(chunk);
        }).on('end', function() {
            var body = Buffer.concat(data).toString();
            console.log("GOT register: " + body);
            server._tunnel_data = JSON.parse(body);

            server.emit('tunnelConnected', server._tunnel_data);
        });
    });
    //get.end();
};

ReverseHTTPServer.prototype.listen = function(port, host) {
    this._target = { host: host, port: port };
    this._createSockets();
};

ReverseHTTPServer.prototype._createSockets = function(connection_count) {
    var limit = connection_count || this._connectionLimit;
    for (var idx = 0; idx < limit; idx++) {
        var new_socket = this._transport.connect(this._target.port, this._target.host, this._options);
        new_socket.setTimeout(this.timeout);
        this.addSocket(new_socket);
    }
};

ReverseHTTPServer.prototype.removeSocket = function(socket) {
    var idx = this._connectionsList.indexOf(socket);

    if (idx !== -1) {
        this._connectionsList.splice(socket, 1);
    }
};

ReverseHTTPServer.prototype.addSocket = function (socket) {
    var server = this;
    var socketIdx = this._socketCounter++;
    var event_type = (this._options.useSSL === true) ? 'secureConnect' : 'connect';
    socket._id = socketIdx;

    socket.on(event_type, function() {
        socket._server = server;
        http_server.connectionListener.call(server, socket);
        server.emit('connection', socket);

        socket.on('data', function(data) {
            server.emit('data', socket, data);
        });
        socket.on('close', function() {
            server.removeSocket(socket);
            server.emit('clientClose', socket);
        });
        socket.on('timeout', function() {
            server.removeSocket(socket);
            server.emit('timeout', socket);
        });
        socket.on('error', function(e){
            server.emit('clientError', socket);
        });
    });


    this._connectionsList.push(socket);
};

exports.ReverseHTTPServer = ReverseHTTPServer;
