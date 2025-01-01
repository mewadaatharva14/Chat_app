const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/Employee', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// Mongoose Schemas and Models
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const chatSchema = new mongoose.Schema({
  senderEmail: { type: String, required: true },
  receiverEmail: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Chat = mongoose.model("Chat", chatSchema);

// Create Express App
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// HTTP and WebSocket Servers
const server = createServer(app);
const io = new Server(server);

// Routes
app.get('/', (req, res) => res.sendFile(__dirname + '/register.html'));
app.get('/login', (req, res) => res.sendFile(__dirname + '/login.html'));
app.get('/chat', (req, res) => res.sendFile(__dirname + '/chat.html'));

// Route for getting contacts
app.get('/contacts', async (req, res) => {
  const email = req.query.email;
  try {
    const contacts = await User.find({ email: { $ne: email } });
    res.json(contacts);
  } catch (err) {
    console.error("Error loading contacts:", err.message);
    res.status(500).send("Error loading contacts!");
  }
});

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).send("Email already exists. Please login.");
    await User.create({ username, email, password });
    res.redirect('/login');
  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).send("Error registering user!");
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || user.password !== password) return res.status(400).send("Invalid email or password.");
    res.redirect(`/chat?email=${email}`);
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).send("Error logging in!");
  }
});

// WebSocket Logic
io.on('connection', (socket) => {
  console.log("A user connected");

  // Initializing the user on socket connection
  socket.on('init', async (userEmail) => {
    socket.join(userEmail);
    console.log(`${userEmail} joined the socket room.`);
  });

  // Load previous chats between users
  socket.on('load chat', async ({ userEmail, chatWith }) => {
    const messages = await Chat.find({
      $or: [
        { senderEmail: userEmail, receiverEmail: chatWith },
        { senderEmail: chatWith, receiverEmail: userEmail }
      ],
    }).sort({ timestamp: 1 });

    socket.emit('load messages', messages);
  });

  // Send a message to the receiver
  socket.on('send message', async ({ senderEmail, receiverEmail, content }) => {
    const newMessage = new Chat({ senderEmail, receiverEmail, content });
    await newMessage.save();

    // Emit the new message to both sender and receiver in real-time
    io.to(senderEmail).emit('receive message', newMessage);
    io.to(receiverEmail).emit('receive message', newMessage);
  });

  // Disconnect the user from the socket room
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Start Server
server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
