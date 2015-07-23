/**
 * Created by andreytsvetkov on 01.07.15.
 */
var net = require('net'),
    common = require('./socket.common.js'),
    statsdClient = require('statsd-client');

var statsd = {
        gauge: function(){},
        gaugeDelta: function(){},
        increment: function(){}
    },
    statsQPS = {}, stats = {};

module.exports.server = function(namespace, port, instance) {
    if (!namespace) {
        console.error("Please set NAMESPACE for this server.");
        return false;
    }

    function Server(namespace, port, instance) {
        this.namespace = namespace;
        this.methods = {};
        this.host = '0.0.0.0';
        this.port = port || 8124;
        this.stats_prefix = namespace + (instance==undefined ? "" : "-"+instance);
        this.init();
    }

    Server.prototype.init = function() {
        var self = this;
        stats[self.stats_prefix] = 0;
        statsQPS[self.stats_prefix] = 0;
        self.server = net.createServer(function(client) {

            common.AddLineReader(client);
            client.on('line', function(data) {
                stats[self.stats_prefix]++;
                statsQPS[self.stats_prefix]++;
                var request = safeExecute(JSON.parse, data, []);
                if (!request[0]) return false;

                var response = {
                    send: function(error, data) {
                        data = safeExecute(JSON.stringify, [request[0], error, data], null);
                        if (!data) return false;
                        client.write(data + '\n');

                        var stats_name = self.stats_prefix + request[1].substring(self.namespace.length);
                        console.log(stats_name);
                        if (stats_name in stats) {
                            stats[stats_name]--;
                        }
                        stats[self.stats_prefix]--;
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
                if (stats[self.stats_prefix] >= 10000) {
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
    Server.prototype.initMetrics = module.exports.initMetrics;
    /**
     * Добавление метода обработки запросов
     * @param method - строка, название метода
     * @param callback - обработчик запроса
     */
    Server.prototype.use = function (method, callback) {
        var self = this;
        stats[self.stats_prefix + ':' + method] = 0;
        statsQPS[self.stats_prefix + ':' + method] = 0;
        self.methods[self.namespace + ':' + method] = function() {
            stats[self.stats_prefix + ':' + method]++;
            statsQPS[self.stats_prefix + ':' + method]++;

            callback.apply(self, arguments);

            if (arguments[1].noCallback) {
                stats[self.stats_prefix + ':' + method]--;
                stats[self.stats_prefix]--;
            }
        };
    };


    return new Server(namespace, port, instance);
};

module.exports.initMetrics = function(stat) {
    if (stat && stat.hasOwnProperty('gauge') && stat.hasOwnProperty('gaugeDelta') && stat.hasOwnProperty('increment')) {
        statsd = stat;
    } else if (stat && stat.hasOwnProperty('host')) {
        statsd = new statsdClient(stat);
    } else {
        statsd = new statsdClient({host:process.env.STATSD_HOST || '127.0.0.1'});
    }
    setInterval(sendStats, 1000);
    return module.exports;
}

function safeExecute(func, data, defaultValue) {
    var result = defaultValue;

    try {
        result = func(data);
    } catch(err) {}

    return result;
}
function sendStats() {
    for (var i in stats) {
        statsd.gauge(i, stats[i]);
    }

    for (i in statsQPS) {
        if (statsQPS[i]) statsd.increment(i + '.qps', statsQPS[i]);
        statsQPS[i] = 0;
    }
}