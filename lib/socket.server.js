/**
 * Created by andreytsvetkov on 01.07.15.
 */
var net = require('net'),
    common = require('./socket.common.js'),
    statsdClient = require('statsd-client');

var statsd, statsQPS = {}, stats = {};

module.exports = function(namespace, port) {
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
                stats[self.namespace]++;
                statsQPS[self.namespace]++;
                var request = safeExecute(JSON.parse, data, []);
                if (!request[0]) return false;

                var response = {
                    send: function(error, data) {
                        data = safeExecute(JSON.stringify, [request[0], error, data], null);
                        if (!data) return false;
                        client.write(data + '\n');

                        if (stats[request[1]] || request[1] === 0) {
                            stats[request[1]]--;
                            stats[self.namespace]--;
                        }
                    }
                };

                //console.log(self.methods, request[1]);
                if (request[1] && typeof self.methods[request[1]] == 'function') {
                    self.methods[request[1]](request[2], request[3] ? response : {send: function() {}, noCallback: true}, this.remoteAddress);
                } else {
                    response.send("method not found");
                }

                checkActiveConnection();
            });

            client.on('error', function(err) {
                console.log('SOCKET-REST SERVER, client error', err);
            });

            client.on('close', function() {
                client = null;
            });

            function checkActiveConnection() {
                if (stats[self.namespace] >= 10000) {
                    client.pause();
                    client.paused = true;
                } else if (client.paused) {
                    client.resume();
                    client.paused = false;
                }
            }
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
    Server.prototype.initMetrics = function(stat) {
        if(stat.hasOwnProperty('gauge') &&  stat.hasOwnProperty('gaugeDelta') &&  stat.hasOwnProperty('increment')) {
            statsd = stat;
        }
        else if(stat.hasOwnProperty('host')) {
            statsd = new statsdClient({host: '127.0.0.1'});
        }
        statsd && statsd.gauge(this.namespace, 0);
        statsd && setInterval(sendStats, 1000);
    };
    /**
     * Добавление метода обработки запросов
     * @param method - строка, название метода
     * @param callback - обработчик запроса
     */
    Server.prototype.use = function (method, callback) {
        var self = this;
        stats[self.namespace + ':' + method] = 0;
        statsd.gauge(self.namespace + ':' + method, 0);
        self.methods[self.namespace + ':' + method] = function() {
            stats[self.namespace + ':' + method]++;
            statsQPS[self.namespace + ':' + method]++;

            callback.apply(self, arguments);

            if (arguments[1].noCallback) {
                stats[self.namespace + ':' + method]--;
                stats[self.namespace]--;
            }
        };
    };

    stats[namespace] = 0;

    return new Server(namespace, port);
};

function safeExecute(func, data, defaultValue) {
    var result = defaultValue;

    try {
        result = func(data);
    } catch(err) {}

    return result;
}
function sendStats() {
    for (var i in stats) {
        statsd.gaugeDelta(i, stats[i]);
        stats[i] = 0;
    }

    for (i in statsQPS) {
        if (statsQPS[i]) statsd.increment(i + '.qps', statsQPS[i]);
        statsQPS[i] = 0;
    }
}