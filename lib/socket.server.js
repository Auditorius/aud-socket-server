/**
 * Created by andreytsvetkov on 01.07.15.
 */
var net = require('net'),
    common = require('./socket.common.js');

module.exports.server = function(namespace, port) {
    if (!namespace) {
        console.error("Please set NAMESPACE for this server.");
        return false;
    }

    function Server(namespace, port) {
        this.namespace = namespace;
        this.methods = {};
        this.host = '0.0.0.0';
        this.port = port || 8124;
        this.init();
    }

    Server.prototype.init = function() {
        var self = this;
        self.server = net.createServer(function(client) {

            common.AddLineReader(client);
            client.on('line', function(data) {
                var request = safeExecute(JSON.parse, data, []);
                if (!request[0]) return false;

                var response = {
                    send: function(error, data) {
                        data = safeExecute(JSON.stringify, [request[0], error, data], null);
                        if (!data) return false;
                        client.write(data + '\n');
                    }
                };

                //console.log(self.methods, request[1]);
                if (request[1] && typeof self.methods[request[1]] == 'function') {
                    self.methods[request[1]](request[2], response);
                } else {
                    response.send("method not found");
                }
            });

            client.on('error', function(err) {
                console.log('SOCKET-REST SERVER, client error', err);
            });

            client.on('close', function() {
                client = null;
            });
        });

        self.server.on('error', function(error) {
            console.log('SOCKET REST-SERVER: ', error.code);
            if (error.code != "EADDRINUSE") {
                self.init(self.port);
            } else {
                throw error;
            }
        });

        self.server.listen(self.port, self.host, function() {
            console.log('SOCKET REST-SERVER: server start at port %d', self.port);

            self.use('ping', function(req, res) {
                res.send(null, 'pong');
            });
        });
    };

    Server.prototype.use = function (method, callback) {
        this.methods[this.namespace + ':' + method] = callback;
    };

    return new Server(namespace, port);
};

/**
 * Безопасное выполнение функций, чтоб везде не писать конструкцию try/catch
 * @param func - функцияб которую надо выполнить
 * @param data - данные, передаваемые в функцию
 * @param defaultValue - дефолтное возвращаемое значение в случаи ошибочного выполнения
 * @returns {*} - возвращает результат выполнения функции func
 */
function safeExecute(func, data, defaultValue) {
    var result = defaultValue;

    try {
        result = func(data);
    } catch(err) {}

    return result;
}