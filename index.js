var path = require('path'),
    url = require('url'),
    redis = require('redis'),
    WebSocket = require('ws');

var bot_name = "";
var sockets = {};
var platform = module.exports = function(options) {

  var options = options || {};
  var client_url = options.client_url || "/socket/client.js";
  var pubsub_prefix = options.pubsub_prefix || "__yowl_ws_pubsub__"

  if (options.redis) {
    var redisSubClient = redis.createClient(options.redis);
    redisSubClient.on('message', function(channel, message) {
      var sessionId = channel.spli(":")[1];
      var data = JSON.parse(message);
      var ws = sockets[sessionId];
      if (ws) {
        send_response(ws, data);
      }
    });
    var redisPubClient = redisSubClient.duplicate();
  }

  var initFn = function(bot) {

    pubsub_prefix += bot.display_name;

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

      redisSubClient.subscribe(pubsub_prefix+":"+sessionId);

      ws.on('message', function(jsonBlob) {
        var parsed = JSON.parse(jsonBlob);
        bot(platform, { sessionId: sessionId, __ws: ws }, { type: 'message', message: parsed.message }, function(err, context, event, cb) {
          if (context.session.__pending) {
            context.session.__pending.forEach(function(res) {
              send_response(ws, res);
            });
          }
          oncomplete(err, context, event, cb);
        });
      });

      ws.on('close', function() {
        delete sockets[sessionId];
        redisSubClient.unsubscribe(pubsub_prefix+":"+sessionId);
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
platform.capabilities = ["say", "actions", "typing"]
platform.send = function(context, event, response, cb) {
  ws = context.__ws;
  if (!ws) {
    ws = sockets[context.sessionId];
    if (!ws) {
      var jsonRes = JSON.stringify(response);
      redisPubClient.publish(pubsub_prefix+":"+context.sessionId, jsonRes, function(err, count) {
        if (err || count == 0) {
          if (!context.session.__pending) {
            context.session.__pending = [];
          }
          context.session.__pending.push(response);
        }
        cb(err, context, event, response);
      }
    }
  }

  if (ws) {
    var responses = [response];
    if (context.session.__pending) {
      responses = context.__pending.concat(responses);
    }
    responses.forEach(function(res) {
      send_response(ws, res);
    });
    cb(null, context, event, response);
  }

}

function send_response(ws, response) {
  if (typeof response == "string") {
    ws.send(JSON.stringify({ message: response }));
  } else {
    ws.send(JSON.stringify(response))
  }
}
