var path = require('path'),
    url = require('url'),
    WebSocket = require('ws');

var bot_name = "";
var sockets = {};
var platform = module.exports = function(options) {

  var options = options || {};
  var client_url = options.client_url || "/socket/client.js";

  var initFn = function(bot) {

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

      sockets[sessionId] = ws;

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
        bot(platform, { sessionId: sessionId, __ws: ws }, { type: 'message', message: parsed.message }, function(err, context, event, cb) {
          if (context.__pending) {
            context.__pending.forEach(function(res) {
              send_response(ws, res);
            });
          }
          oncomplete(err, context, event, cb);
        });
      });

      ws.on('close', function() {
        delete sockets[sessionId];
      });

    });

  }
  initFn.id = platform.id;
  initFn.capabilities = platform.capabilities;
  initFn.send = platform.send;
  return initFn;

};

// Define our platform characteristics

platform.id = "ws"
platform.capabilities = ["say", "actions"]
platform.send = function(context, event, response, cb) {
  ws = context.__ws;
  if (!ws) {
    ws = sockets[context.sessionId];
    if (!ws) {
      if (!context.__pending) {
        context.__pending = [];
      }
      context.__pending.push(response);
    }
  }

  if (ws) {
    var responses = [response];
    if (context.__pending) {
      responses = context.__pending.concat(responses);
    }
    responses.forEach(function(res) {
      send_response(ws, res);
    });
  }

  cb(null, context, event, response);
}

function send_response(ws, response) {
  if (typeof response == "string") {
    ws.send(JSON.stringify({ message: response }));
  } else {
    ws.send(JSON.stringify(response))
  }
}
