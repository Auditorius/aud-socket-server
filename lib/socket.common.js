module.exports.AddLineReader = function (socket) {
    var lines, chunk = '';

    socket.on('data', function(data) {
        chunk += data.toString();
        lines = chunk.split('\n');
        chunk = lines.pop();

        while (lines.length) {
            socket.emit('line', lines.shift());
        }

    });
}
