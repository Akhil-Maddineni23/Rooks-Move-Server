const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const CORS_ORIGIN = "http://127.0.0.1:5500"
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || origin === CORS_ORIGIN || origin.startsWith(CORS_ORIGIN)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

// Middlewares
app.use(express.json());
app.use(cors(corsOptions));

const io = socketIO(server, {
  cors: corsOptions,
});

// Store room information
const rooms = {};

io.on('connection', (socket) => {
    console.log('A Player connected');

    // Listen for 'joinRoom' event 
    // Get roomNo for joining into a specific room
    socket.on('joinRoom', (data) => {
        const { roomID, playerName } = data;

        // Check if the room is full (2 players)
        if (rooms[roomID] && rooms[roomID].length >= 2) {
            console.log(`Room ${roomID} is full. Cannot join.`); 
        } else {
            socket.join(roomID);

            // Initialize the room if it doesn't exist
            if (!rooms[roomID]) {
                rooms[roomID] = {
                    players: [],
                    currentPlayerIndex: 0, // Index of the current player in the players array
                };
            }

            // Add the player to the room
            rooms[roomID].players.push({
                socketId: socket.id,
                playerName : playerName,
                active : true,
                turn: rooms[roomID].players.length === 0, // First player gets the first turn
            });

            console.log(`Player with socket Id = ${socket.id} joined room no = ${roomID}`);
            //io.to(roomID).emit('roomJoined', { players: rooms[roomID].players });

            let count = 0;
            rooms[roomID].players.forEach(player => {
              if(player.active){
                count+=1;
              }
            })

            if (count === 2) {
                // Iterate through each player in the room
                rooms[roomID].players.forEach(player => {
                  // Determine whether it's the current player's turn
                  //const isCurrentPlayer = player.socketId === socket.id;

                  // Emit 'opponentStatus' to the individual client with their own status and turn value
                  io.to(player.socketId).emit('opponentStatus', { status: 'online', isTurn: player.turn });
                  console.log(player);
              });
            }
           
        }
    });

    socket.on('playerMove', (data, callback) => {
      const { roomID } = data;
      const room = rooms[roomID];
  
      // Check if it's the player's turn
      const currentPlayer = room.players[room.currentPlayerIndex];
  
      if (socket.id !== currentPlayer.socketId) {
          // It's not the player's turn
          socket.emit('notYourTurn');
          
          // Notify the caller that it's not the player's turn
          if (callback) {
              callback('Not your turn');
          }
  
          return;
      }
  
      // Broadcast the move to all players in the room except the sender
      socket.to(roomID).emit('playerMove', data);
  
      // Switch turn to the other player
      room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;

      // Update the turn status directly using the currentPlayerIndex
      room.players.forEach((player, index) => {
        player.turn = index === room.currentPlayerIndex;

        // Emit 'turnChange' event individually for each socket with their turn value
        io.to(player.socketId).emit('turnChange', { isTurn: player.turn });
      });

      // Notify the caller that the move was successful
      if (callback) {
          callback(null);
      }
    });
  
    socket.on('gameOver', (data) => {
        const { roomID, targetReached } = data;
        // Emit game result to all members in the room
        // this targetReached decides who is the winner - because the game can be over in different instances - time runout, reached target
        io.to(roomID).emit('gameResult', {
            senderSocketID: socket.id,
            targetReached,
        });

        delete rooms[roomID];
    });

    socket.on('exitGame', (data) => {
        console.log('Player disconnected');
        // Remove the user from the room when they disconnect
        Object.keys(rooms).forEach((roomID) => {
            const room = rooms[roomID];

            // Removing that players from the players list - based on his socketID
            room.players = room.players.filter((player) => player.socketId !== socket.id);

            if (room.players.length === 0) {
                // Delete the room if it becomes empty
                delete rooms[roomID];
            }
        });
    })

    socket.on('disconnect', () => {
      console.log('Player disconnected');
      // Remove the user from the room when they disconnect
      Object.keys(rooms).forEach((roomID) => {
          const room = rooms[roomID];

          // Removing that players from the players list - based on his socketID
          room.players = room.players.filter((player) => player.socketId !== socket.id);

          if (room.players.length === 0) {
              // Delete the room if it becomes empty
              delete rooms[roomID];
          }
      });
    });
});

server.listen(3000, () => {
    console.log("Server is running on Port = 3000");
});
