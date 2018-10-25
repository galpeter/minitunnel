var fs = require('fs');
var ReverseHTTPServer = require('reversehttp').ReverseHTTPServer;


var options = {
    shouldOpenNew: true,
    connectionLimit: 4,

    useSSL: true,
    ca: fs.readFileSync('server-ca-cert.crt'),
    // TODO: make sure this can be set to true
    rejectUnauthorized: false,
};
var counter = 1;

var testServer = new ReverseHTTPServer(options, function(req, resp) {
    console.log(req.url);

    if (req.url === '/') {
        var contents = "<h1> DEMO " + counter++  + "</h1>";

        resp.setHeader('Content-Length', contents.length);
        resp.setHeader('Content-Type', 'text/html');
        resp.setHeader('Connection', 'close');

        resp.writeHead(200);
        resp.write(contents);
        resp.write('');
    }
//    resp.end();
});

testServer.on('connection', function(socket) {
    console.log('New connection to TUN ID: ' + socket._id);
});
testServer.on('clientClose', function(socket) {
    console.log('Closing connection to TUN ID: ' + socket._id);
});
testServer.on('timeout', function(socket) {
    console.log('Timeout on connection ID: ' + socket._id);
});
testServer.on('error', function(socket) {
    console.log('Error on connection ID: ' + socket._id);
});
testServer.on('data', function(socket, data) {
    console.log('INP: ');
    console.log(data.toString());
});

testServer.requestTunnel('http://localhost:8889', function(tunnel_info) {
   console.log('Registered tunnel: ' + JSON.stringify(tunnel_info));
   testServer.listen(tunnel_info.remote_port, tunnel_info.remote_host);

   console.log('Use: https://localhost:8889' + tunnel_info.url);
});

