(function() {

  var socket;

  function resolveUrl(url) {
    var a = document.createElement('a');
    a.href = url;
    return a.href;
  }

  var yowl = {

    connect: function(options) {

      var options = options || {};
      var url = options.url || '/socket';
      var access_token = options.access_token;

      if (url.indexOf('ws:') !== 0 && url.indexOf("wss:") !== 0) {
        url = resolveUrl(url).replace('http', 'ws');
      }

      if (access_token) {
        if (url.indexOf("?") == -1) {
          url += '?'
        } else {
          url += '&'
        }
        url += encodeURIComponent(access_token);
      }

      socket = new WebSocket(url);

      socket.onopen = function() {
        this.send({ type: 'authenticate' });
      }.bind(this);

      socket.onmessage = function(message) {
        if (typeof message.data == "string" && this.onmessage) {
          this.onmessage(JSON.parse(message.data));
        }
      }.bind(this);

      socket.onclose = function() {
        setTimeout(function() {
          this.connect();
        }.bind(this), 1000);
      }.bind(this);

    },

    send: function(message) {

      if (typeof message == "string") {
        socket.send(JSON.stringify({
          message: message
        }));
      } else {
        socket.send(JSON.stringify(message));
      }

    }

  }

  window.yowl = yowl;

})()
