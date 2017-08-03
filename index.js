var path = require('path'),
    url = require('url'),
    WebSocket = require('ws');

// Define our platform characteristics

var bot_name = "";
var platform = {
  name: "ws",
  capabilities: ["say", "actions"],
  send: function(context, event, response, cb) {
    if (typeof response == "string") {
      context.__ws.send(JSON.stringify({ message: response }));
    } else {
      context.__ws.send(JSON.stringify(response))
    }
    cb(null, context, event, response);
  }
};

exports = module.exports = function(options) {

  var options = options || {};
  var client_url = options.client_url || "/socket/client.js";

  return function(bot) {

    bot.app.get(client_url, function(req, res) {
      res.sendFile(path.resolve(__dirname, 'client.js'));
    });

    var wss = new WebSocket.Server({ server: bot.server });

    wss.on('connection', function(ws, req) {
      const location = url.parse(req.url, true);
      var sessionId = location.query.access_token || req.headers.access_token || req.headers.cookie.access_token;

      if (!sessionId) {
        sessionId = bot.generateSessionId();
        ws.send(JSON.stringify({ 'sessionId': sessionId }));
      }

      bot(platform, { sessionId: sessionId, __ws: ws }, { type: 'authenticate' }, oncomplete);

      function oncomplete(err, context, event, cb) {
        if (err) {
          event.send("Uh oh! Something went wrong!", function(err, context, event, response) {
            cb(err, context, event);
          });
        } else {
          cb(err, context, event);
        }
      }

      ws.on('message', function(jsonBlob) {
        var parsed = JSON.parse(jsonBlob);
        bot(platform, { sessionId: sessionId, __ws: ws }, { type: 'message', message: parsed.message }, oncomplete);
      });

    });

  }

};
