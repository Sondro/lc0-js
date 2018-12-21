
function openTab(evt, tabname) {
  $(".tabcontent").hide();
  $(".tablinks").removeClass("active");
  $("#" + tabname).show();
  evt.currentTarget.className += " active";
}


var Controller = function() {

  const kStateOff = 0;
  const kStateReady = 1;
  const kStateRunning = 2;
  const kStateCancelling = 3;
  const kStateReplacing = 4;

  const kRegexBestMove = /^bestmove ([a-h][1-8])([a-h][1-8])([nbrq])?/;

  function Controller() {
    var cfg = {
      draggable: true,
      showNotation: true,
      position: "start",
      onDragStart: this.onDragStart.bind(this),
      onDrop: this.onDrop.bind(this),
      onSnapEnd: this.onSnapEnd.bind(this)
    };

    this.board = ChessBoard("board", cfg);
    $("#startBtn").on("click", this.startpos.bind(this));
    $("#flipBtn").on("click", this.board.flip);
    $("#takebackBtn").on("click", this.takeback.bind(this));
    $("#goBtn").on("click", this.go.bind(this));
    $("#stopBtn").on("click", this.stop.bind(this));
    $("#restartBtn").on("click", this.createEngine.bind(this));
    $("#error").on("click", this.hideError.bind(this));

    this.output = document.getElementById("output");

    this.game = new Chess();
    this.movelist = [];
    this.pgn = "";

    this.createEngine();
  }

  Controller.prototype = {

    startpos() {
      this.game.reset();
      this.board.start(true);
      this.movelist = [];
      this.pgn = "";
      $("#movelist").text("");
    },


    getCurrentSetup() {
      var setup = "position startpos";
      var history = this.game.history({verbose: true});
      if (history.length > 0) {
        setup += " moves";
        for (var i = 0; i < history.length; i++) {
          var move = history[i];
          var coord_move = move.from + move.to;
          if (move.promotion) coord_move += move.promotion;
          setup += " " + coord_move;
        }
      }
      return setup;
    },

    go() {
      this.send(this.getCurrentSetup());
      this.send("go infinite");
    },

    stop() {
      this.send("stop");
    },

    createEngine() {
      if (this.worker) {
        this.worker.terminate();
        this.worker=null;
      }
      CreateLC0Worker()
        .then(this.initEngine.bind(this))
        .catch(this.showError.bind(this));
    },

    initEngine(worker) {
      this.worker = worker;
      this.worker.onmessage = this.receive.bind(this);
      this.worker.onerror = this.engineError.bind(this);
      this.state = kStateOff;
      this.uciPendingSearch = null;
    },

    send(message) {
      this.worker.postMessage(message);
      this.output.value += "send: " + message + "\n";
      this.output.scrollTop = output.scrollHeight;
    },

    searchResponse(move) {
      move = this.makeMove(move);
      if (move == null) return;
      switch (move.flag) {
        case "n":
        case "b":
        case "c":
          this.board.move(move.from + "-" + move.to);
          break;

        default:
          this.board.position(this.game.fen());
          break;
      }
    },

    requestSearch(search) {
      switch (this.state) {
        case kStateOff:
          break;

        case kStateReady: {
          this.state = kStateRunning;
          this.send(search.setup);
          this.send(search.go);
          break;
        }

        case kStateRunning: {
          this.state = kStateReplacing;
          this.uciPendingSearch = search;
          this.send("stop");
          break;
        }

        case kStateCancelling: {
          this.state = kStateReplacing;
          this.uciPendingSearch = search;
          break;
        }

        case kStateReplacing: {
          this.uciPendingSearch = search;
          break;
        }
      }
    },

    cancelSearch(search) {
      switch (this.state) {
        case kStateOff:
        case kStateReady:
        case kStateCancelling:
          break;

        case kStateRunning: {
          this.state = kStateCancelling;
          this.send("stop");
          break;
        }

        case kStateReplacing: {
          this.state = kStateCancelling;
          this.uciPendingSearch = null;
          break;
        }
      }
    },

    receive(e) {
      var message = e.data;
      if (Array.isArray(message)) {
        this.output.value += message[1] + ": " + message[0] + "\n";
      } else {
        // engine
        this.output.value += message + "\n";
        switch (this.state) {
          case kStateOff:
            if (message == "uciok") {
              this.state = kStateReady;
            }
            break;

          case kStateReady:
            break;

          case kStateRunning: {
            var match = message.match(kRegexBestMove);
            if (match) {
              var move = {from: match[1], to: match[2], promotion: match[3]};
              this.state = kStateReady;
              this.searchResponse(move);
            }
            break;
          }

          case kStateCancelling: {
            var match = message.match(kRegexBestMove);
            if (match) this.state = kStateReady;
            break;
          }

          case kStateReplacing: {
            var match = message.match(kRegexBestMove);
            if (match) {
              this.state = uciPendingSearch = null;
              this.state = kStateReady;
            }
            break;
          }
        }
      }
      this.output.scrollTop = output.scrollHeight;
    },

    takeback() {
      if (this.movelist.length == 0) return;
      var last_move = this.movelist.splice(-1, 1);
      this.game.undo();
      this.board.position(this.game.fen());
      $("#movelist").text(this.game.pgn());
    },

    onDragStart(source, piece, position, orientation) {
      if (this.game.game_over() === true ||
          (this.game.turn() === "w" && piece.search(/^b/) !== -1) ||
          (this.game.turn() === "b" && piece.search(/^w/) !== -1)) {
        return false;
      }
    },

    onDrop(source, target) {
      var move = {from: source, to: target, promotion: "q"};  // TODO
      move = this.makeMove(move);
      if (move === null) return "snapback";

      if (this.game.turn() == "b") {
        this.requestSearch(
            {"setup": this.getCurrentSetup(), "go": "go movetime 5000"});
      }
    },

    makeMove(move) {
      var move = this.game.move(move);
      if (move == null) return null;
      this.movelist.push(move);
      $("#movelist").text(this.game.pgn());
      return move;
    },

    onSnapEnd() {
      this.board.position(this.game.fen());
    },

    engineError(e) {
      this.showError("Engine error: "+e.message+" (line "+e.lineno+")");
    },

    showError(message) {
      $("#error-content").text(message);
      $("#error").show();
    },

    hideError() {
      $("#error").hide();
      $("#error-content").empty();
    }


  };

  return Controller;
}();

new Controller();
