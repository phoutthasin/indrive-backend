const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// REST API ທົດສອບ
app.get('/', (req, res) => {
  res.send('inDrive Backend Real-time Server is running! 🚀');
});

// REST API ສຳລັບສະໝັກສະມາຊິກ (Register)
app.post('/api/auth/register', (req, res) => {
  const { username, phone, password, role } = req.body;
  console.log('📝 New Register Data:', { username, phone, role });
  
  // 📍 ບ່ອນນີ້ສາມາດຂຽນໂຄດເຊື່ອມຕໍ່ Database ເພື່ອບັນທຶກຂໍ້ມູນລົງ DB ໄດ້ຕາມຕ້ອງການ
  
  res.status(200).json({ 
    success: true, 
    message: 'ສະໝັກສະມາຊິກສຳເລັດ!',
    data: { username, phone, role }
  });
});

// REST API ສຳລັບຄຳນວນຄ່າໂດຍສານ (Calculate Fare)
app.post('/api/calculate-fare', (req, res) => {
  const { pickup, dropoff } = req.body;
  console.log('💰 Calculate Fare Request:', { pickup, dropoff });
  
  // 📍 ຄຳນວນຄ່າໂດຍສານເບື້ອງຕົ້ນ (ຕົວຢ່າງ: ຄິດໄລ່ຕາມระยะທາງ ຫຼື ຕັ້ງລາຄາຄົງທີ່)
  const estimatedFare = 15000; // ຕົວຢ່າງ 15,000 ກີບ
  
  res.status(200).json({ 
    success: true, 
    fare: estimatedFare,
    distance: '2.5 km'
  });
});

// REST API ສຳລັບເຂົ້າສູ່ລະບົບ (Login)
app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;
  console.log('🔑 Login Request:', { phone });
  
  // 📍 ບ່ອນນີ້ສາມາດຂຽນໂຄດກວດສອບຂໍ້ມູນຈາກ Database
  
  res.status(200).json({ 
    success: true, 
    message: 'ເຂົ້າສູ່ລະບົບສຳເລັດ!',
    token: 'mock-jwt-token-12345',
    user: { phone }
  });
});


// Socket.io Real-time Events
io.on('connection', (socket) => {
  console.log(`⚡ User connected: ${socket.id}`);

  // ລູກຄ້າ/ຄົນຂັບ ເຂົ້າ Room
  socket.on('join_passenger_room', (userId) => socket.join('passengers'));
  socket.on('join_driver_room', (driverId) => socket.join('drivers'));

  // 1. ລູກຄ້າສົ່ງອໍເດີ -> ຍິງຫາຄົນຂັບທຸກຄົນ
  socket.on('send_ride_request', (rideData) => {
    console.log('📦 New Ride Request:', rideData);
    io.to('drivers').emit('new_ride_available', {
      ...rideData,
      requestId: Date.now().toString(),
      passengerSocketId: socket.id
    });
  });

  // 2. ຄົນຂັບຕໍ່ຮອງລາຄາ (Counter Offer) -> ຍິງຫາລູກຄ້າເຈົ້າຂອງອໍເດີ
  socket.on('driver_counter_offer', (offerData) => {
    console.log('🏷️ Driver Counter Offer:', offerData);
    io.to(offerData.passengerSocketId).emit('receive_counter_offer', offerData);
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});