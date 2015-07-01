# aud-socket-server && aud-socket-client

## Install
    npm i aud-socket-server
    npm i aud-socket-client

## Use
    var socketServer = require('aud-socket-server')('test-service', 8124);// namespace port
    socketServer.use('methodName', function(req, res) {
        console.log(req); //'test from client'
        res.send(null, 'test from server');
    });

    var socketClient = require('aud-socket-client')('test-service', [{host:'127.0.0.1',port:8124}]);// namespace config(list of servers)
    socketServer.connect(function(err) {
        if(err)
            throw err;

        socketClient.send('methodName', 'test from client', function(err, result){
            console.log(result); //'test from server'
        });
    });

